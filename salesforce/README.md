# Salesforce metadata

Metadata for Salesforce objects this service reads that do not exist in the org
yet. It lives next to the code that reads it so the two are edited together; if
your org's metadata is managed centrally elsewhere, move these files there and
leave a pointer behind.

Nothing here has been deployed. Deploying is a change to the production org and
is somebody's deliberate decision, not a side effect of merging this branch.

## Discount_Code__c

A percentage-off code a buyer types into an order form. The object exists so
staff can add, activate, expire and retire codes from a Salesforce list view
without a code change or a deploy.

| Field | Type | What it is for |
|---|---|---|
| `Name` | Text | Friendly label - "Russell Moore podcast". Shown to the buyer when the code is accepted. |
| `Code__c` | Text(40), unique, external id | What the buyer types. Case-insensitive. Letters, numbers, `-` and `_` only. |
| `Percent_Off__c` | Number(3,0) | Whole percent off the order subtotal, 1-100. |
| `Active__c` | Checkbox | Untick to kill the code immediately, whatever the dates say. |
| `Start_Date__c` | Date | First day it works, inclusive, US Eastern. Blank = works now. |
| `End_Date__c` | Date | Last day it works, inclusive, US Eastern. Blank = never expires. |
| `Product__c` | Picklist | Which order form it is good for. Blank = valid everywhere. |
| `Max_Redemptions__c` | Number(6,0) | Paid orders allowed before it stops. Blank = no limit. |
| `Times_Redeemed__c` | Number(6,0) | Paid orders that have used it. See the caveat below. |
| `Notes__c` | Long text | Who it went to and why. Internal only - never sent to a browser. |

Three validation rules stop records that would look fine in a list view and fail
silently at the till: a percentage outside 1-100, an end date before the start
date, and a code containing characters the order form strips before it looks the
code up (so the stored code could never be matched).

### Deploying it

```bash
sf project deploy start \
  --source-dir salesforce/force-app/main/default/objects/Discount_Code__c \
  --source-dir salesforce/force-app/main/default/permissionsets/Discount_Code_Integration_Read.permissionset-meta.xml \
  --target-org <your-org-alias>
```

Then assign the permission set to the integration user - the one the Connected
App authenticates as under the client-credentials flow, which is what
`/api/form/discount-code` runs as:

```bash
sf org assign permset --name Discount_Code_Integration_Read --target-org <your-org-alias>
```

The permission set grants **read only**. The endpoint looks a code up and
answers yes or no; it never creates, edits or deletes one, so granting more
would only widen what a compromised endpoint could reach. `Notes__c` is left out
of it deliberately - the endpoint has no reason to read it.

Staff who manage codes need ordinary object access through their own profile or
permission set; that is a normal admin task and is not included here, since it
depends on which profiles exist in the org.

### Times Redeemed is not maintained automatically

`Max_Redemptions__c` is enforced against `Times_Redeemed__c`, but nothing
increments `Times_Redeemed__c` yet, so today it is a manual count.

That is deliberate rather than unfinished. The order form hands the buyer to
Stripe and may never see them again, so a browser-side increment would burn a
redemption every time somebody reached the payment page and changed their mind.
Counting belongs to whatever learns that an order was actually **paid** - the
Stripe webhook pipeline in `mprefuge/payment-processor`.

Two ways to close it when you want the limit enforced for real:

- Add a `Discount_Code__c` lookup to `Form__c`, and roll up paid orders with
  DLRS (already installed in the org - the `dlrs__` objects are there). Point
  and click, no code.
- Or increment it from the paid-order handler in the payment service.

Until then, leave `Max_Redemptions__c` blank on codes you are not policing by
hand. A blank limit means no limit, which is honest; a limit that is never
counted against is not.
