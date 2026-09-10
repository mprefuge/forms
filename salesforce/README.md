# Salesforce metadata

Metadata for Salesforce objects this service reads. It lives next to the code
that reads it so the two are edited together; if your org's metadata is managed
centrally elsewhere, move these files there and leave a pointer behind.

**Status:** `Discount_Code__c` and its first two permission sets are deployed to
production (`Refuge International`, org `00D4x0000050OIqEAM`) and assigned.

The campaign association - `Campaign__c` on the code, the three `Transaction__c`
fields, `Discount_Tracking_Integration`, and the removal of `Product__c` - has
**passed validation but is not yet deployed** (23/23 components, 0 errors).

Treat a deploy from here as a deliberate decision about production, never a side
effect of merging a branch. Validate first (`--dry-run`); the first three
attempts at this one failed validation, which cost nothing because nothing was
committed.

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
| `Campaign__c` | Lookup(Campaign), required | The financial campaign this code discounts. Restricted to revenue-generating campaigns. |
| `Max_Redemptions__c` | Number(6,0) | Paid orders allowed before it stops. Blank = no limit. |
| `Times_Redeemed__c` | Number(6,0) | Paid orders that have used it. See the caveat below. |
| `Notes__c` | Long text | Who it went to and why. Internal only - never sent to a browser. |

Three validation rules stop records that would look fine in a list view and fail
silently at the till: a percentage outside 1-100, an end date before the start
date, and a code containing characters the order form strips before it looks the
code up (so the stored code could never be matched).

### Why the campaign, and not a product name

A code is scoped to the campaign it discounts, and the endpoint checks it
against the campaign the ORDER will be filed under - the same value the order
form sends the payment service as `category`, which becomes
`Transaction__c.Campaign__c`.

That is the point of using the campaign rather than a product string: the code
is validated against the very record the money lands on, so a code cannot
discount a purchase it was never issued for. It also means the association is
real for reporting - "what did this code sell, and what did it cost us" is a
report over `Transaction__c`, joined on `Campaign__c` and `Discount_Code__c`.

`Campaign__c` is required. A code with no campaign is refused rather than
treated as valid everywhere: this is money, and the safe reading of a missing
scope is no scope. A code that should span campaigns needs a junction object,
not a blank lookup.

## Transaction__c

Three fields record what a paid order was discounted by. The payment service
sets them from Stripe metadata; nothing else writes them.

| Field | Type | What it is for |
|---|---|---|
| `Discount_Code__c` | Lookup(Discount_Code__c) | Which code was used. Blank = full price. |
| `Discount_Percent__c` | Number(3,0) | The percentage applied, recorded at purchase. |
| `Discount_Amount__c` | Currency | What the discount took off. |

`Discount_Percent__c` is stored rather than read back off the code record on
purpose: the code's own `Percent_Off__c` can be edited afterwards, and this has
to keep saying what this buyer was actually charged.

### Discount Amount is revenue forgone, not revenue

`Discount_Amount__c` is what the discount took off. It is **not** money
received, it is **not** part of gross, fee or net, and it must never be added to
them. `Amount_Gross__c` is what Stripe actually charged, after the discount came
off, and net stays computed from its components. Summing `Discount_Amount__c`
into a revenue figure overstates income.

Report it on its own, as what a discount programme cost. And exclude refunded
transactions when you do: a discount on an order that was refunded was not a
discount given, and the same rule that keeps refunds out of positive revenue
totals applies here.

The order form sends this as an integer number of cents
(`discount_amount_cents`) rather than the formatted `discount_amount` string
beside it. That is deliberate and worth preserving: a number that has been
through a currency formatter has lost the argument about what unit it is in,
which is exactly how `Cover_Fees_Amount__c` came to be stored 100x overstated on
one of the two write paths.

### What ships with it

| Component | What it is for |
|---|---|
| `Discount_Code__c` | The object, its 9 fields, 2 list views and 3 validation rules. |
| `Discount_Code__c` tab | So staff can find it from the App Launcher instead of through Setup. |
| `Discount_Code_Manager` | Full CRUD plus field access. **Assign this to whoever manages codes.** |
| `Discount_Code_Integration_Read` | Read only, for the API user `/api/form/discount-code` runs as. |
| `Discount_Tracking_Integration` | Read codes, write the three `Transaction__c` fields. For the payment service's user. |

### Deploying it

```bash
sf project deploy start \
  --source-dir salesforce/force-app/main/default/objects/Discount_Code__c \
  --source-dir salesforce/force-app/main/default/objects/Transaction__c \
  --source-dir salesforce/force-app/main/default/permissionsets \
  --source-dir salesforce/force-app/main/default/tabs \
  --target-org <your-org-alias>
```

`Product__c` is gone, replaced by `Campaign__c`. Removing a field is a
destructive change, so it needs a `destructiveChangesPost.xml` naming
`Discount_Code__c.Product__c` - the `sf` command above deploys the additions but
will not delete it for you.

### Then assign the permission sets - this is not optional

```bash
# Whoever manages codes. Without this they cannot see the Active tick or the dates.
sf org assign permset --name Discount_Code_Manager --target-org <alias> --on-behalf-of <user>

# The integration user - the one the Connected App authenticates as under the
# client-credentials flow, which is what /api/form/discount-code runs as.
sf org assign permset --name Discount_Code_Integration_Read --target-org <alias> --on-behalf-of <api-user>

# The payment service's user, so it can write the discount onto a transaction.
# Almost certainly the same API user: it authenticates the same way.
sf org assign permset --name Discount_Tracking_Integration --target-org <alias> --on-behalf-of <api-user>
```

**Deploying fields grants field-level security to nobody** - not to the
deploying admin, not to a System Administrator, not to anyone. `Modify All Data`
bypasses *object* permissions, not FLS. So immediately after a successful
deploy, `Active__c`, the dates, `Campaign__c`, `Max_Redemptions__c`,
`Times_Redeemed__c` and `Notes__c` are invisible to every user in the org, and
the object looks broken: you get `Name`, `Code__c` and `Percent_Off__c` (the two
required fields are always visible) and nothing else. That is what
`Discount_Code_Manager` is for. This bites every time and is worth re-reading
before concluding the deploy failed.

`Discount_Code_Integration_Read` grants **read only**. The endpoint looks a code
up and answers yes or no; it never creates, edits or deletes one, so granting
more would only widen what a compromised endpoint could reach. `Notes__c` is
left out of it deliberately - the endpoint has no reason to read it.

No permission set names `Code__c`, `Percent_Off__c` or `Campaign__c`. All three
are required fields, and Salesforce rejects the whole deploy with *"You cannot
deploy to a required field"* if you list one. They are always visible to anyone who can see
the record, so nothing is lost by omitting them - do not "fix" this by adding
them back.

### If a deploy fails

The two that will catch you, both found the hard way deploying this:

- **`description` is capped at 255 characters** on validation rules, permission
  sets and the object - but 1000 on fields. A long explanation belongs in this
  README, not in a `<description>`.
- **A checkbox filter in a list view takes `1` / `0`**, not `true` / `false`
  (*"Use \"0\" or \"1\""*).

Validate before you deploy (`--dry-run` on the `sf` command above). Both of
those surface in validation, where they cost nothing.

### The integration user has Modify All Data

Worth knowing before you rely on `Discount_Code_Integration_Read` as a control:
it currently buys nothing, because the user it is assigned to already has
everything.

The forms Function App authenticates as **Refuge International API**
(`api@refugelouisville.onmicrosoft.com`). Its profile, *Salesforce API Only
System Integrations*, is appropriately narrow - no Modify All Data, no View All
Data. But the user also holds a permission set called **Full Access**, which
does have `PermissionsModifyAllData`, and that grants full create/edit/delete on
all 145 objects in the org - Contact, Account, Opportunity, `Transaction__c`,
`Form__c`, and `Discount_Code__c`, which it picked up automatically the moment
the object existed.

This was confirmed by hand: authenticating as that user and creating a
`Discount_Code__c` record succeeded, despite `Discount_Code_Integration_Read`
granting read only. The record was deleted immediately.

Every `/api/form` route is `authLevel: anonymous`. So the blast radius of any
injection or logic bug in that Function App is the entire org, not the one
object the endpoint reads. For discount codes specifically, it means someone who
finds a write path can mint themselves a 100% code - the read-only permission
set does not stop them while Full Access is in play.

Fixing it is not a one-liner and is deliberately **not** done here: Full Access
is presumably load-bearing for the forms service, the payment-processor sync and
whatever else uses that user, so removing it without tracing every dependency
would break production. The shape of the fix is to work out what each
integration actually needs, express that as its own permission set, and retire
Full Access from the API user once nothing depends on it.

### Times Redeemed is not maintained automatically - but now it can be

`Max_Redemptions__c` is enforced against `Times_Redeemed__c`, but nothing
increments `Times_Redeemed__c` yet, so today it is a manual count.

Now that paid transactions point at the code that was used, the clean fix is a
DLRS rollup (DLRS is already installed - the `dlrs__` objects are there):
count `Transaction__c` records where `Discount_Code__c` is this code and the
status is a paid one, into `Times_Redeemed__c`. That counts *paid* orders, which
is the whole point - a buyer who reaches the payment page and abandons it must
not burn a redemption.

A matching rollup of `Discount_Amount__c` onto `Campaign__c` gives the cost of a
discount programme per campaign. Both are point-and-click; neither needs code.

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
