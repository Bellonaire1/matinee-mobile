/**
 * Redis Lua scripts for atomic seat hold operations.
 *
 * Atomicity Guarantees:
 * - Redis runs Lua scripts as single atomic operations on the main execution thread.
 * - Multi-seat acquisition is all-or-nothing: if any seat is already held by another token,
 *   zero keys are created or mutated.
 * - Safe release guarantees only the token holder can release their own held seats.
 * - Safe extension guarantees only the token holder can extend their hold, with strict
 *   extension count and lifetime caps to prevent indefinite holds.
 * - Correct heartbeat logic: extension adds 300 seconds to the existing expiration window,
 *   never shortening an active hold, and strictly capped at 900 seconds from creation.
 */

export const ACQUIRE_HOLD_LUA = `
local numSeatKeys = #KEYS - 1
local tokenKey = KEYS[#KEYS]
local holdToken = ARGV[1]
local ttl = tonumber(ARGV[2])
local seatPayload = ARGV[3]
local tokenPayload = ARGV[4]

local conflictingKeys = {}
for i = 1, numSeatKeys do
  local key = KEYS[i]
  local val = redis.call('GET', key)
  if val then
    local data = cjson.decode(val)
    if data.holdToken ~= holdToken then
      table.insert(conflictingKeys, key)
    end
  end
end

if #conflictingKeys > 0 then
  return {0, conflictingKeys}
end

for i = 1, numSeatKeys do
  redis.call('SET', KEYS[i], seatPayload, 'EX', ttl)
end

redis.call('SET', tokenKey, tokenPayload, 'EX', ttl)

return {1, "OK"}
`;

export const RELEASE_HOLD_LUA = `
local numSeatKeys = #KEYS - 1
local tokenKey = KEYS[#KEYS]
local holdToken = ARGV[1]

local tokenDataStr = redis.call('GET', tokenKey)
if not tokenDataStr then
  return {0, "TOKEN_NOT_FOUND"}
end

local tokenData = cjson.decode(tokenDataStr)
if tokenData.holdToken ~= holdToken then
  return {0, "TOKEN_MISMATCH"}
end

local deletedCount = 0
for i = 1, numSeatKeys do
  local key = KEYS[i]
  local val = redis.call('GET', key)
  if val then
    local data = cjson.decode(val)
    if data.holdToken == holdToken then
      redis.call('DEL', key)
      deletedCount = deletedCount + 1
    end
  end
end

redis.call('DEL', tokenKey)

return {1, deletedCount}
`;

export const EXTEND_HOLD_LUA = `
local numSeatKeys = #KEYS - 1
local tokenKey = KEYS[#KEYS]
local holdToken = ARGV[1]
local extensionTtl = tonumber(ARGV[2])
local maxExtensions = tonumber(ARGV[3])
local nowMs = tonumber(ARGV[4])
local maxLifetimeMs = tonumber(ARGV[5])

local tokenDataStr = redis.call('GET', tokenKey)
if not tokenDataStr then
  return {0, "TOKEN_NOT_FOUND"}
end

local tokenData = cjson.decode(tokenDataStr)
if tokenData.holdToken ~= holdToken then
  return {0, "TOKEN_MISMATCH"}
end

local currentExtensions = tonumber(tokenData.extensionCount or 0)
if currentExtensions >= maxExtensions then
  return {0, "MAX_EXTENSIONS_EXCEEDED"}
end

local createdAt = tonumber(tokenData.createdAt)
local currentExpiresAt = tonumber(tokenData.expiresAt) or (createdAt + 600000)

if nowMs >= currentExpiresAt then
  return {0, "TOKEN_NOT_FOUND"}
end

local newExpiresAt = currentExpiresAt + (extensionTtl * 1000)
local maxExpiresAt = createdAt + maxLifetimeMs
if newExpiresAt > maxExpiresAt then
  newExpiresAt = maxExpiresAt
end

if newExpiresAt < currentExpiresAt then
  newExpiresAt = currentExpiresAt
end

local newTtl = math.floor((newExpiresAt - nowMs) / 1000)
if newTtl <= 0 then
  return {0, "MAX_LIFETIME_EXCEEDED"}
end

tokenData.extensionCount = currentExtensions + 1
tokenData.expiresAt = newExpiresAt

redis.call('SET', tokenKey, cjson.encode(tokenData), 'EX', newTtl)

for i = 1, numSeatKeys do
  local key = KEYS[i]
  local val = redis.call('GET', key)
  if val then
    local seatData = cjson.decode(val)
    if seatData.holdToken == holdToken then
      seatData.expiresAt = newExpiresAt
      redis.call('SET', key, cjson.encode(seatData), 'EX', newTtl)
    end
  end
end

return {1, newTtl, newExpiresAt, tokenData.extensionCount}
`;

/**
 * Atomically releases an in-progress idempotency lock only if the caller owns the lock.
 * Prevents race condition where a timed-out request's cleanup deletes a newer request's lock.
 */
export const RELEASE_IDEMPOTENCY_LOCK_LUA = `
local val = redis.call('GET', KEYS[1])
if val then
  local ok, data = pcall(cjson.decode, val)
  if ok and data.lockOwnerId == ARGV[1] and data.status == 'IN_PROGRESS' then
    return redis.call('DEL', KEYS[1])
  end
end
return 0
`;

/**
 * Atomically records completed idempotency result only if the worker still holds the lock.
 * Prevents a stale worker from overwriting a newer request's lock or record.
 */
export const COMPLETE_IDEMPOTENCY_LUA = `
local val = redis.call('GET', KEYS[1])
if val then
  local ok, data = pcall(cjson.decode, val)
  if ok and data.lockOwnerId == ARGV[1] and data.status == 'IN_PROGRESS' then
    redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
    return 1
  end
end
return 0
`;
