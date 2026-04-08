# PFJ Pricing Engine - Deployment & Testing Guide

## Overview

This is a comprehensive pricing engine for Shopify that allows dynamic price updates based on customer selections (metal type, diamond type, etc.). When a user makes a selection, the price updates on the product page, and the surcharge is passed through to the cart where it's applied before checkout.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. ADMIN DASHBOARD (app.rates.jsx)                                  │
│    - Admin sets daily rates for metals & diamonds                   │
│    - Stored in Prisma database                                      │
│    - Mirrored to Shop Metafields (storefront reads these)           │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. STOREFRONT (price-selector.liquid)                               │
│    - Reads rates from Shop Metafields                               │
│    - User selects Metal & Diamond options                           │
│    - Price updates dynamically on page                              │
│    - Surcharge stored in hidden form properties                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. FORM SUBMISSION                                                  │
│    - User clicks "Add to Cart"                                      │
│    - Form includes: surcharge, metal selection, diamond selection  │
│    - Shopify converts form properties → cart attributes             │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 4. CART TRANSFORM (cart_transform_run.js)                           │
│    - Triggered when item added to cart                              │
│    - Reads _surcharge from cart attributes                          │
│    - Calculates: base price + surcharge                             │
│    - Sets fixed price on cart line item                             │
│    - Shopify applies this price in checkout                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Deploy the App

```bash
# Navigate to project directory
cd d:\Suraj Sharma\projects\shopifyApp\PFJ-price-engine\pfj-pricing

# Start development server
shopify app dev
```

The app will:

1. Build all extensions (cart transform + theme block)
2. Create a tunnel to your development store
3. Install the app into the store

---

## Step 2: Configure Rates (Admin)

1. Open the Shopify app in your development store
2. Click on "Daily Pricing Rates"
3. Set prices for:
   - 18K Gold: Enter price per gram (e.g., 60)
   - 14K Gold: Enter price per gram (e.g., 45)
   - 9K Gold: Enter price per gram (e.g., 30)
   - Natural Diamond: Enter price per carat (e.g., 5000)
   - Lab Grown Diamond: Enter price per carat (e.g., 2000)
4. Click "Save rates"

These rates are now available to your storefront.

---

## Step 3: Add Price Selector Block to Product Page

1. Go to your development store
2. Edit a product page
3. Add the "PFJ Price Selector" block from app extensions
4. Configure the block:
   - Enable "Show metal selector" ✓
   - Enable "Show diamond selector" ✓
   - Customize labels if needed
5. Save the page

---

## Step 4: Test Basic Flow

### 4.1 Test Price Display Update

1. Open the product page **in a private/incognito browser window**
2. Press **F12** to open Developer Tools
3. Go to the **Console** tab
4. **Select a metal option** (e.g., "18K Gold")
   - Expected: Price on page updates to base price + surcharge
   - Console should show: `[PFJ] Form synced with surcharge:`
5. **Select a diamond option** (e.g., "Natural Diamond")
   - Expected: Price updates further
   - Console should show updated surcharge value
6. **Change metal selection**
   - Expected: Price updates again
7. **Verify form properties** in Console:
   ```javascript
   // In console, run:
   document.querySelector('form[action*="/cart/add"]');
   // Look for hidden inputs with names: properties[_surcharge], properties[Metal], properties[Diamond]
   ```

### 4.2 Test Cart Addition

1. From the same page, **click "Add to Cart"**
2. **Keep the Console open**
3. **Go to cart page**
4. **Open Console again** and look for:
   - `[PFJ-Transform] Processing cart with 1 line(s)`
   - `[PFJ-Transform] ✅ Found _surcharge attribute:`
   - `[PFJ-Transform] 💰 CALCULATION:` (shows base + surcharge = total)
5. **Verify cart item price**:
   - Should show base price + surcharge
   - NOT the base price alone

### 4.3 Test Checkout

1. Proceed to **checkout page**
2. **Open Console**
3. Verify the **final price**:
   - Should include the surcharge
   - Should NOT revert to base price
4. **Complete checkout** (or cancel, your choice)

---

## Step 5: Test Edge Cases

### Case 1: Multiple Items in Cart

1. Add one product with selection (e.g., 18K Gold, Natural Diamond)
2. Add the same product again with different selection (e.g., 9K Gold, No Diamond)
3. Go to cart
4. Verify each item has correct pricing
5. Console should show both items processed with correct surcharges

### Case 2: Variant Selection

1. If product has multiple variants, **select a different variant**
2. Verify price updates to **base price of new variant** + surcharge
3. Console should show base price change
4. Add to cart
5. Verify in cart that price = new variant base + surcharge

### Case 3: Zero Surcharge

1. Keep "Standard" for metal (surcharge = 0)
2. Keep "No Diamond" for diamond (surcharge = 0)
3. Add to cart
4. Verify price = base price exactly
5. Console should show surcharge = 0, no expand operation

### Case 4: Large Quantities

1. Add product with selection
2. Change quantity to 5+ items
3. Add to cart
4. Verify:
   - Each unit price = base + surcharge
   - Total = (base + surcharge) × quantity
   - Console should show correct calculation

---

## Step 6: Verify in Deployment

### Before Production Deploy

```bash
# Run tests
npm run test --workspace=extensions/pfj-cart-transform

# Expected: All test fixtures pass
# - default.test.js (single item with surcharge)
# - multiple-items.json (multiple items)
# - no-surcharge.json (no surcharge applied)
```

### Deploy to Production

```bash
# From project root
shopify app deploy

# Follow prompts to deploy:
# 1. Confirm you want to deploy (yes)
# 2. Wait for deployment to complete
# 3. Verify app is installed in your store
```

---

## Troubleshooting

### Issue: Price doesn't update when selecting metal/diamond

**Check:**

1. Console shows `[PFJ-Debug] ERROR: ...` messages?
2. Is the Shop Metafield populated with rates?
   ```javascript
   // In console, run:
   fetch("/admin/api/2024-04/graphql.json", {
     method: "POST",
     body: JSON.stringify({
       query: `{ shop { metafields(first: 10, namespace: "pfj_pricing") { edges { node { key value } } } } }`,
     }),
   })
     .then((r) => r.json())
     .then((d) => console.log(JSON.stringify(d, null, 2)));
   ```
3. Are the dropdown selectors present?
   ```javascript
   // In console:
   document.querySelector('[data-pfj="metal"]'); // Should not be null
   document.querySelector('[data-pfj="diamond"]'); // Should not be null
   ```

**Solutions:**

1. Clear browser cache (Ctrl+Shift+Del in most browsers)
2. Go back to admin and save rates again
3. Refresh product page
4. Try private/incognito window

### Issue: Surcharge not applied in cart

**Check:**

1. Form properties being set correctly?
   ```javascript
   // In console on product page:
   var form = document.querySelector('form[action*="/cart/add"]');
   var surchargeInput = form.querySelector(
     'input[name="properties[_surcharge]"]',
   );
   console.log("Surcharge value:", surchargeInput?.value);
   ```
2. Cart Transform receiving the attribute?
   - Open DevTools when item is added to cart
   - Console should show: `[PFJ-Transform] ✅ Found _surcharge attribute:`
3. If not found, check if form properties are being converted to attributes
   - Shopify should auto-convert `properties[]` to cart attributes
   - If not working, ensure form submission is normal (not AJAX)

**Solutions:**

1. Ensure form is submitted normally (not intercepted)
2. Try clearing cart and re-adding item
3. Check cart transform logs in app editor

### Issue: "No rates configured" error

**Solution:**

1. Go to app admin panel → "Daily Pricing Rates"
2. Enter values for all 5 rate fields (use 0 if not applicable)
3. Click "Save rates"
4. Return to product page and refresh

### Issue: Cart Transform not triggering

**Check:**

1. Is the extension deployed?
   ```bash
   shopify app deploy
   ```
2. Check extension status in Shopify admin → Settings → Apps and integrations → [Your App]
3. Look for "Cart Transforms" section

**Solution:**

1. Re-deploy the app
2. Wait 5-10 minutes for Shopify to process
3. Try adding a new product to cart

---

## Monitoring & Logs

### View App Logs

```bash
# During development (shopify app dev running)
# Open Dev Console in your app to see logs
# → http://localhost:3000 → F12
```

### View Cart Transform Logs

1. Add item to cart while watching browser DevTools
2. Go to checkout page
3. Open DevTools Console
4. Look for `[PFJ-Transform]` prefixed messages
5. Each message shows:
   - Line item being processed
   - Surcharge found/not found
   - Price calculation (base + surcharge)
   - Final operation applied

Example log sequence:

```
[PFJ-Transform] ========================================
[PFJ-Transform] Processing cart with 1 line(s)
[PFJ-Transform] ========================================
[PFJ-Transform] Processing line: gid://shopify/CartLine/1
[PFJ-Transform] ✅ Found _surcharge attribute: 45000
[PFJ-Transform] 💰 CALCULATION: { baseCents: 249900, surchargeCents: 45000, totalCents: 294900, ... }
[PFJ-Transform] ✅ Operation created for line: gid://shopify/CartLine/1
[PFJ-Transform] ========================================
[PFJ-Transform] COMPLETE - Total operations: 1
[PFJ-Transform] ========================================
```

---

## API Endpoints Reference

### 1. Calculate Price (GET)

```
GET /api/calculate-price/rates
```

**Purpose:** Get current configured rates from database

**Response:**

```json
{
  "success": true,
  "rates": {
    "gold18k": 6000, // in cents
    "gold14k": 4500,
    "gold9k": 3000,
    "diaNat": 500000,
    "diaLab": 200000
  },
  "lastUpdated": "2024-04-06T12:00:00Z"
}
```

### 2. Calculate Price (POST)

```
POST /api/calculate-price
```

**Request Body:**

```json
{
  "variantId": "gid://shopify/ProductVariant/123",
  "basePrice": 2499,
  "metalSurcharge": 45000,
  "diamondSurcharge": 0,
  "currency": "INR"
}
```

**Response:**

```json
{
  "success": true,
  "basePrice": 2499,
  "metalSurcharge": 45000,
  "diamondSurcharge": 0,
  "totalSurcharge": 45000,
  "totalPrice": 47499,
  "currency": "INR",
  "breakdown": {
    "base": "₹24.99",
    "metal": "₹450.00",
    "diamond": "₹0.00",
    "total": "₹474.99"
  }
}
```

### 3. Sync Cart

```
POST /api/sync-cart
```

**Purpose:** Sync cart attributes (for internal logging/debugging)

---

## Validation Checklist

Before going to production, verify:

- [ ] All 5 rates are configured (non-negative numbers)
- [ ] Price selector block is added to product page
- [ ] Block settings show "Show metal selector" ✓ and "Show diamond selector" ✓
- [ ] Selecting options updates price on page
- [ ] Console shows no `ERROR` messages (warnings are OK)
- [ ] Form properties are set with values
- [ ] Adding to cart doesn't revert price to base
- [ ] Cart shows correct total (base + surcharge)
- [ ] Checkout shows correct final price
- [ ] Multiple items in cart calculate independently
- [ ] Zero surcharge (standard options) doesn't add expand operation
- [ ] Test fixtures pass: `npm run test --workspace=extensions/pfj-cart-transform`

---

## Support

If you encounter issues after deployment:

1. Check the troubleshooting section above
2. Review console logs (both on product page and in cart)
3. Verify rates are configured
4. Verify extension is deployed and active
5. Try the "Step 4: Test Basic Flow" section with fresh browser session
6. Check that theme has product form with `action*="/cart/add"`

---

## Files Modified/Created

### Core Files Changed

- `extensions/pfj-pricing-ex/blocks/price-selector.liquid` - Enhanced logging and price update logic
- `extensions/pfj-cart-transform/src/cart_transform_run.js` - Improved error handling and logging
- `app/routes/api.calculate-price.jsx` - NEW: Dynamic price calculation API
- `app/routes/api.sync-cart.jsx` - NEW: Cart sync API

### Test Fixtures Added

- `extensions/pfj-cart-transform/tests/fixtures/multiple-items.json` - NEW
- `extensions/pfj-cart-transform/tests/fixtures/no-surcharge.json` - NEW

---

## Next Steps

1. **Deploy**: Run `shopify app deploy` from project root
2. **Test**: Follow "Step 4: Test Basic Flow" section
3. **Monitor**: Watch console logs during cart operations
4. **Validate**: Use "Validation Checklist" before production
5. **Support**: Reference "Troubleshooting" if issues arise
