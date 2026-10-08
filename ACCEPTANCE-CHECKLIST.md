# Browser Acceptance Checklist (after `npm install`)

This checklist should be completed by the farm owner before using real data or deploying publicly.

- [ ] Copy `.env.example` to `.env.local`, enter a new email and password, then run `npm run init`.
- [ ] Open `/api/health` and see `status: ok` and 8 beds.
- [ ] Open `/` and `/dashboard`; both should show 0 stock/revenue on a new installation, not demo figures.
- [ ] Log in at `/login`; admin view appears, and anonymous `/api/admin/state` is blocked.
- [ ] Enter a past-dated batch of dung under Slot 1; verify the amount appears in Slot 1.
- [ ] Approval before minimum precompost age should be rejected; approval after inspection/age should work.
- [ ] Allocate a portion of the approved lot into empty Bed 1; Slot 1 remaining kilograms should decrease.
- [ ] Attempt to open another active batch in Bed 1; it must fail without changing inventory.
- [ ] Add a moisture/care entry to Bed 1 and see it in batch logs.
- [ ] Harvest before 45 days should be rejected; harvest after the minimum and inspection should free the bed and increase `BULK-COMPOST`.
- [ ] Package a 50kg compost bag: bulk stock should decrease by 50kg for each bag and bag SKU stock should increase by one.
- [ ] Update a product's price and publish it; the public `/products` should show its price and stock.
- [ ] Place a customer order on `/products`; admin Orders should include the customer's phone and shipping address and stock should be reserved.
- [ ] Cancel an unpaid test order; stock should be restored only once.
- [ ] Move a new order through pending → confirmed → packed → delivered and mark Paid; the monthly sales report should include it.
- [ ] Add an actual expense; verify the net calculation is revenue minus recorded expenses.
- [ ] Submit a contact inquiry from `/contact`; see it in admin Inquiries and mark contacted/closed.
- [ ] Publish a Knowledge article, Blog post and Video HTTPS link; ensure each appears on the right public page.
- [ ] Edit the farm's address, team and map URL in Settings; verify changes on public pages.
- [ ] Enable/disable public investor financials; verify paid revenue/expenses are shown or hidden accordingly.
- [ ] Check layout and forms on a mobile-width browser; test cart, modal, navigation, and login.
- [ ] Run `npm test`, `npm run build`, then `npm run start` after dependency installation.
- [ ] Configure HTTPS, persistent database path, external backups, and restricted admin accounts before public production launch.

## v1.1 — Dynamic layout / approval regression checklist

- [ ] Admin > Beds > `নতুন বেড যোগ`: save a 9th bed, edit name and capacity; counts update in admin and public views.
- [ ] Admin > Slots > `নতুন স্লট যোগ`: save 6th slot; add a dated dung lot and see it in the lot ledger.
- [ ] Try to approve immature dung: informative minimum date is shown; button is available only after the waiting period.
- [ ] When a lot is mature, inspect and approve; new bed batch selector shows `Slot name • Lot # • remaining kg`.
- [ ] Backdate new bed start to *before* approval date: the lot must not become available. Select an allowed date instead.
- [ ] Finish creating a bed batch and verify the slot lot's remaining kg decreases exactly once.
- [ ] Deactivate an empty bed and empty slot, then reactivate; public active counts change but audit/history remain.
- [ ] Attempt to deactivate a bed with an active batch or a slot with remaining dung: explicit error, no data is lost.
- [ ] Attempt deletion on historical units: rejected. A genuinely unused bed or slot can be permanently removed.
- [ ] Restart the app; removed/archived units are not re-created, logins and historical records persist.
- [ ] With old data, confirm no old batch/lot/order changed and no duplicates were inserted.
