# Professional referral links

Professional referrals use signed links to grant eligible new accounts a 14-day trial. Standard accounts continue to receive the 3-day trial.

## Configure

Set these server-side environment variables in Vercel:

- `PROFESSIONAL_REFERRAL_SIGNING_SECRET`: a private signing secret with at least 32 characters.
- `PROFESSIONAL_REFERRAL_ADMIN_KEY`: a separate private key with at least 32 characters, used only to issue links.
- `PUBLIC_APP_URL` (optional): the public site origin; defaults to `https://www.mymeridianapp.com`.

Generate the two secrets independently, for example with `openssl rand -base64 48`. Do not prefix them with `VITE_` or expose them in client code. Redeploy after adding or rotating environment variables. Rotating the signing secret invalidates existing referral links.

## Issue a partner link

Call the protected endpoint with the practice name and admin key:

```sh
curl --fail-with-body https://www.mymeridianapp.com/api/referral-link \
  -H "Authorization: Bearer $PROFESSIONAL_REFERRAL_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"practiceName":"Example Family Law"}'
```

Share the returned URL with that practice. Links are signed, expire after one year, and cannot be edited to change the associated practice. A code is applied only to an account created within the previous 30 days; accounts can have only one professional referral.
