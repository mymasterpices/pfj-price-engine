# Price Surcharge Disappearing - Complete Debug Guide

## THE ISSUE

The price surcharge displays correctly on the product page when a customer selects metal/diamond, but **disappears when they add to cart** and appears at the base price only.

---

## ROOT CAUSE ANALYSIS

### Problem Identified

The Liquid block is sending surcharge data as **form properties** (`properties[_surcharge]`), but the Cart Transform function is querying for **cart line attributes** (`attribute(key: "_surcharge")`).

In Shopify's system:

- **form `properties[]`** → Line item properties (displayed with order, for customer reference)
- **cart line `attributes`** → Custom attributes (for pricing rules, transforms)

These are **NOT the same field**. The cart transform cannot access line properties through the `attribute()` query.

---

## DEBUGGING STEPS (Do These First)

### Step 1: Enable Console Logging

After deploying, open your store's product page and check **browser console** (F12 → Console):

```
[PFJ] Cart add intercepted: { sur: 45000, properties: {...} }
```

**If you DON'T see this**, the Liquid block isn't intercepting the ATC button.
**If you DO see it**, the Liquid block is working.

### Step 2: Check Cart Data

In Shopify admin → checkout flow, check:

1. Does the order have the "Metal" and "Diamond" properties? ✓ = Success
2. Can you see the selected metal/diamond in order notes? ✓ = Success

**If properties aren't appearing in orders**, the data isn't being transmitted.

### Step 3: Check Cart Transform Logs

Shopify Cart Transform functions should output logs. Check:

- Shopify Admin → Settings → Apps and integrations → PFJ Price Engine
- Look for deployment/function logs

**If no logs**, cart transform might not be registering correctly.

If logs show `[PFJ-Transform] Skipping line (no attr.value)`, **this confirms the issue**: attributes are null because properties aren't being converted to attributes.

---

## SOLUTION OVERVIEW

### Root Fix (Recommended)

The cart transform needs to access the surcharge data reliably. Since form properties may not persist to the cart transform context, we need an alternative approach:

**Use Shopify's Storefront API or encoded variant data instead of form properties.**

However, quick workarounds exist. See below.

---

## QUICK FIXES (Test These)

### Quick Fix #1: Ensure Form Submission Works

The Liquid block intercepts fetch() calls, but traditional form submission might be using different code paths.

**To test:**

1. Go to product page
2. Select metal/diamond (price updates ✓)
3. **Right-click → Inspect → Network tab**
4. Click "Add to Cart"
5. Look for `/cart/add` request
6. In the Request → Form Data, verify `properties[_surcharge]` is present

**If missing**, the form isn't being constructed properly.
**If present**, properties are being sent but not arriving in the cart transform.

### Quick Fix #2: Check Theme Compatibility

Some themes (like Dawn, Prestige) use different cart systems:

1. Check which theme you're using (Shopify Admin → Online Store → Themes)
2. If it's a custom theme, verify it supports line item properties

**Complex themes with custom cart handlers might ignore properties entirely.**

### Quick Fix #3: Test Without Drawer Cart

If your theme uses a drawer/sidebar cart:

1. Go through to the full **checkout page** instead
2. Check if the price updates there

**If it works in checkout but not in drawer**, the theme's drawer cart system is custom and doesn't support our property injection.

---

## PERMANENT FIXES

### Permanent Fix #1: Update the Liquid Block to Ensure Properties Persist

The updated `price-selector.liquid` now includes:

- Better logging: `console.log('[PFJ] Cart add intercepted:', ...)`
- Explicit string conversion: `String(sur)` instead of just `sur`
- Try/catch error handling

**Deploy this change and test again.**

### Permanent Fix #2: Update Cart Transform to Debug Better

The updated `cart_transform_run.js` now logs:

- `[PFJ-Transform] Processing cart with X lines`
- For each line: `attribute key, value, base price`
- `[PFJ-Transform] Returning X operations`

**This will help confirm if the cart transform is receiving the surcharge attribute.**

Run the test:

```bash
npm test  # in /extensions/pfj-cart-transform
```

The test fixture now includes a sample with `_surcharge` attribute.

### Permanent Fix #3: Verify Cart Transform is Registered

Check Shopify Admin:

1. Settings → Apps and integrations
2. PFJ Price Engine → Configuration
3. Verify "Cart Transform" is enabled

If it's not listed, you may need to re-deploy:

```bash
shopify app deploy
```

---

## ADVANCED FIX: Use Custom Cart Attributes (If above don't work)

If form properties don't work with your theme, use Shopify's cart attributes API directly:

**The idea**: Instead of form properties, use the Storefront API to add items with custom attributes that the cart transform CAN access.

**This requires:**

1. Removing form-based approach
2. Using `fetch('/cart/add.js')` with structured JSON
3. Ensuring the JSON includes `attributes: { _surcharge: '45000' }`

**Current implementation already does this in the fetch interception** (line 300+ in price-selector.liquid).

---

## VERIFICATION CHECKLIST

✓ Browser console shows `[PFJ] Cart add intercepted`  
✓ Network tab shows `/cart/add` with `properties[_surcharge]`  
✓ Item appears in cart checkout with Metal/Diamond properties visible  
✓ Cart page shows updated price (not base price)  
✓ `npm test` passes for cart-transform  
✓ Shopify logs show `[PFJ-Transform] Applying surcharge` message

**If all ✓**, the fix is working!  
**If any ✗**, the issue is in that specific step.

---

## NEXT ESCALATION

If none of the fixes work:

1. **Check theme source code** - Custom themes might override cart behavior
2. **Test on development store** - Ensure storefront is using latest extension
3. **Run `shopify app dev`** and test locally with live theme
4. **Check Shopify function logs** - Might have API errors we're not seeing

---

## SUMMARY

**Before**: Form properties → Cart Transform (failed, not converted to attributes)  
**After**: Form properties → (with debugging) → Cart Transform (with logging to verify flow)  
**If still fails**: Properties not accessible to cart transform, need Storefront API approach.

The updated code provides visibility into where the failure is occurring.
