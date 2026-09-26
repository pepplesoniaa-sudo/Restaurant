---
trigger: glob
---

# Money Rules

Scope: prices, fees and order totals. There is no payment processing in scope yet.

## Hard rules — breaking any of these fails the task even if it runs

- **Store every amount as a whole integer in kobo.** ₦1,500 is `150000`. Never floats or decimals
  for money. Anywhere. Ever.
- **Convert to naira only at display time**, in one shared formatting helper.
- **The server computes `Order.total`:** sum of `unitPrice × quantity` over the order's items,
  plus the restaurant's `deliveryFee` at the time of ordering. A total sent by the client is ignored.
- **`unitPrice` is copied from `MenuItem.price` on the server** when the order is placed. A price
  sent by the client is ignored.
- **Prices are positive.** `MenuItem.price > 0`; `deliveryFee >= 0`; `quantity >= 1`.
- **Do not invent prices, fees, discounts or charges.** If a task needs a number the README
  doesn't give, stop and ask.
- **Do not add a payment provider.** Payments are out of scope until a human adds them.

## When unsure

Stop and ask (`AGENTS.md` §7). Guessing a price or adding a charge is a failure, not a shortcut.
