# PFJ Price Update Troubleshooting - Quick Diagnostic

## Step 1: Check If Block Is Added to Page

Open product page and check:

```javascript
// In browser console (F12 → Console tab):
document.querySelector('[id^="pfj-"]');
// Should return an element, NOT null
```

**If null:** Block is not added to product page

- Go to Shopify Admin → Online Store → Edit theme
- Add "PFJ Price Selector" block to product page
- Save and reload

---

## Step 2: Check If Rates Are Configured

```javascript
// In browser console:
shop.metafields.pfj_pricing;
// Should show object with: gold_18k, gold_14k, gold_9k, dia_nat, dia_lab
```

**If undefined or empty:** Rates not configured

- Go to your app → "Daily Pricing Rates"
- Enter values for ALL 5 rates (minimum: 1 for each)
- Click "Save rates"
- Wait 30 seconds, reload product page

---

## Step 3: Check If Dropdowns Are Visible

```javascript
// In browser console:
document.querySelector('[data-pfj="metal"]'); // Should exist
document.querySelector('[data-pfj="diamond"]'); // Should exist
```

**If either returns null:** Dropdowns hidden

- Edit product page
- Click "PFJ Price Selector" block settings
- Check: ☑ "Show metal selector"
- Check: ☑ "Show diamond selector"
- Save page
- Reload

---

## Step 4: Check Console Logs

1. Open product page
2. Press **F12** → **Console** tab
3. Look for messages starting with `[PFJ-Debug]`

**Expected messages on page load:**

- `[PFJ-Debug] Initialized with:` ← Block found
- `[PFJ-Debug] Found variant input, setting up MutationObserver` ← Variant tracked
- `[PFJ-Debug] Calling interceptATC()` ← Form hook ready
- `[PFJ-Debug] Initialization complete`

**If you see ERRORS:**

- `ERROR: metalSel not found!` → Dropdown hidden (see Step 3)
- `ERROR: priceEl is null!` → Price element not found

---

## Step 5: Test Selection Change

1. From browser console, select a metal:

```javascript
document.querySelector('[data-pfj="metal"]').value = "45000";
document.querySelector('[data-pfj="metal"]').dispatchEvent(new Event("change"));
```

2. Watch console for:

- `[PFJ-Debug] Metal select changed:` message
- `[PFJ-Debug] updateDisplay():` showing new total
- Price element text should update

**If price doesn't update:**

- Check the console for errors
- Verify `priceEl` is found in updateDisplay logs

---

## Step 6: Check if Selection Changes Are Detected

Just **select a metal option** from the dropdown:

Console should log:

```
[PFJ-Debug] Metal select changed: { value: "45000", label: "18K Gold" }
[PFJ-Debug] getSurchargeCents(): { metal: 45000, diamond: 0, total: 45000 }
[PFJ-Debug] updateDisplay(): { basePrice: 2499, surcharge: 45000, total: 47499, ... }
[PFJ-Debug] Setting price text: ₹474.99
```

**If you don't see these logs:**

- JavaScript not running
- Check for errors in console
- Try hard refresh (Ctrl+Shift+R)

---

## Common Fixes

### Fix 1: Hard Refresh

```
Windows: Ctrl + Shift + R
Mac: Cmd + Shift + R
```

### Fix 2: Clear Cache

- Press F12
- Right-click refresh button → "Empty cache and hard refresh"

### Fix 3: Rebuild and Redeploy

```bash
cd d:\Suraj Sharma\projects\shopifyApp\PFJ-price-engine\pfj-pricing
shopify app deploy
```

### Fix 4: Check Rates Really Saved

```javascript
// In browser console:
fetch("/admin/api/2024-10/graphql.json", {
  method: "POST",
  body: JSON.stringify({
    query: `{ shop { metafields(first: 10, namespace: "pfj_pricing") { edges { node { key value } } } } }`,
  }),
})
  .then((r) => r.json())
  .then((d) =>
    console.table(
      d.data.shop.metafields.edges.map((e) => ({
        key: e.node.key,
        value: e.node.value,
      })),
    ),
  );
```

Should show all 5 rates with values.

---

## If Still Not Working

1. **Copy all console errors** from F12 → Console
2. **Run this test:**

```javascript
console.log("=== PFJ DIAGNOSTIC ===");
console.log("1. Block element:", !!document.querySelector('[id^="pfj-"]'));
console.log(
  "2. Metal selector:",
  !!document.querySelector('[data-pfj="metal"]'),
);
console.log(
  "3. Diamond selector:",
  !!document.querySelector('[data-pfj="diamond"]'),
);
console.log("4. Price display:", !!document.querySelector('[id^="pfj-price"]'));
console.log(
  "5. Metal value:",
  document.querySelector('[data-pfj="metal"]')?.value,
);
console.log(
  "6. Diamond value:",
  document.querySelector('[data-pfj="diamond"]')?.value,
);
console.log("=== END DIAGNOSTIC ===");
```

3. **Share the output** with these details:
   - What theme are you using?
   - When you select metal, does ANY price update (main or block)?
   - What do the console logs show?
   - All diagnostic outputs above
