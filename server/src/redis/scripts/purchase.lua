-- Flash Sale Purchase Lua Script
-- ARGV[1] = userId
-- ARGV[2] = purchasedAt (ISO 8601 timestamp, set by caller)
-- Returns: 0 = success, 1 = already_purchased, 2 = sold_out

local userId = ARGV[1]
local purchasedKey = 'flash:purchased:' .. userId
local stockKey = 'flash:stock'

-- Step 1: Check if user already purchased
if redis.call('EXISTS', purchasedKey) == 1 then
  return 1
end

-- Step 2: Check if stock is exhausted
local stock = tonumber(redis.call('GET', stockKey))
if stock == nil or stock <= 0 then
  return 2
end

-- Step 3: Decrement stock
redis.call('DECR', stockKey)

-- Step 4: Record purchase (store timestamp so GET /api/purchase/status can return it)
redis.call('SET', purchasedKey, ARGV[2])

-- Step 5: Return success
return 0