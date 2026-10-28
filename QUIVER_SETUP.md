# Sending orders to QuiverCRM

Each order placed on the site is saved locally, emailed (if Gmail is set up), and sent to QuiverCRM.

Set these environment variables on the server (e.g. in Render):

- `QUIVER_URL` – your QuiverCRM order endpoint, e.g. `https://your-quiver.onrender.com/api/integrations/orders`
- `QUIVER_KEY` – the vendor integration key (`qcrm_live_...`) from the QuiverCRM Vendors/Settings screen

Delivery status is stored on each order as `quiverStatus` (`sent` or `failed`) and `quiverError`.
Failed deliveries are retried up to 3 times. Repeat deliveries are ignored by QuiverCRM, so retries never create duplicates.
