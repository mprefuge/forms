# Salesforce metadata

Metadata for Salesforce objects this service reads. It lives next to the code
that reads it so the two are edited together; if your org's metadata is managed
centrally elsewhere, move these files there and leave a pointer behind.

**Status:** fully deployed to production (`Refuge International`, org
`00D4x0000050OIqEAM`) and working end to end, verified against a real paid
order. All three permission sets are assigned, and `Times_Redeemed__c` is
maintained by a DLRS rollup - see below.

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
| `Times_Redeemed__c` | Number(6,0) | Paid orders that have used it. Maintained by a DLRS rollup - see below. |
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

### Paying by check

An order can be placed without paying online. `POST /api/transaction/check` on
the payment service writes a **pending** `Transaction__c` and returns; no Stripe
session is created and no money moves. A person reconciles it when the check
arrives.

| Field | Type | What it is for |
|---|---|---|
| `Manual_Reference__c` | Text(64), unique, external id | The record's only unique key for a transaction that never went through a processor. |
| `Days_Awaiting_Check__c` | Formula(Number) | Whole days since the order was placed, while it is a pending check **from this form**. Blank otherwise. |
| `Check_Chase_Task_Created__c` | Checkbox | Whether the office has already been asked to chase it. |

**`Manual_Reference__c` is the whole point of that path.** The ordinary upsert
matches on the Stripe ids and, finding none, falls back to contact plus amount
plus timestamp. On Stripe traffic that fallback never fires. On a check it would
be the only duplicate guard there is, and two $400 checks from the same church
would silently become one record. `upsertManualTransaction` keys on this field
and nothing else, so a resubmission of the same order updates one row and two
genuinely different orders are two rows - by construction, rather than by
inference from what they happen to cost.

The reference is minted by the browser as `HG-YYMMDD-XXXXXX`, short enough for a
buyer to copy onto the check. It is the same id the card path sends Stripe as
`client_reference_id`.

#### The record is shaped the way the org already shapes a check

Not the way this code would have invented. Every one of the 131 manual
transactions already in the org carries the **Manual Transaction** record type
and `transaction_type__c = 'Check'`, and not one of them uses
`Payment_Type__c` — so neither does this.

Leaving `RecordTypeId` unset is how the first check order came out as a
**Donation**: Salesforce falls back to the running user's default, and that made
it the only Donation-typed record among 4,893. The handler now resolves the
record type by name.

The buyer's **Contact** is linked, and their organisation's **Account** when one
was named — found if they exist, created if not. The forms service does not
create a contact for this form, so looking one up and giving up left the office
with an order they could not trace to a person.

#### Manual Reference is also what scopes the chase

`Days_Awaiting_Check__c` and the flow's entry filter both require it to be
non-blank. The org holds **77 pending manual checks entered by hand**, which
belong to somebody else's process; only an order placed through the form carries
a reference. Without that clause the flow's first run would have filed a task on
every one of them.

#### What a pending check deliberately does NOT carry

`Received_At__c` is left empty. Nothing has been received - the check is, at
best, in the post - and stamping it would put the order into any report that
sums receipts by date. A person sets it when they bank the check.

`Amount_Fee__c` and `Amount_Net__c` are left empty for the same class of reason:
nobody has taken a cut of anything yet, and null lets a report tell "no fee" from
"fee not yet known". Net is never stored as a guess; it is computed from
components once there are components.

`Sync_to_Quickbooks__c` is written as `false` explicitly rather than left to the
field default. There is no money to post until somebody banks the check.

#### The seven-day chase

`Chase_Pending_Check_Orders` is a scheduled flow, daily at 1pm Eastern. It looks
at every transaction that is still `pending`, still `transaction_type__c = Check`,
carries a `Manual_Reference__c`, and is not yet marked chased; where
`Days_Awaiting_Check__c` has reached 7 it files one Task to the
**Office Staff queue** - `WhatId` the transaction, `WhoId` the buyer, so the task
opens with their phone and email on it - and ticks `Check_Chase_Task_Created__c`.

The task goes to a queue rather than a person because the work belongs to a role.
Staff come and go; a task owned by somebody who has left is a task nobody does.
Membership is managed in Setup, so who answers for it changes without a deploy.

The tick is what makes it happen once instead of every night. To ask again on an
order that still has not been paid, untick it.

The `Awaiting a Check` list view on Transaction__c shows the same set the flow
acts on.

**Two things a deploy will not do, and both leave this inert:**

- The queue deploys with **no members**. A queue with no members is a task nobody
  sees. Seed it from Setup, or by creating `GroupMember` rows.
- The flow deploys as **Draft** whatever `<status>` says, because production
  requires flow test coverage to deploy one active. Activate it afterwards - the
  deploy result will say Succeeded either way.

  On a **re-deploy** this is sharper than it looks. A changed flow lands as a new
  version, still Draft, and the OLD version stays Active — so
  `FlowDefinition.ActiveVersionId` is set and everything looks fine while the
  version actually running is the one you just replaced. Check that
  `ActiveVersionId` matches the *latest* version, not merely that it is set.

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
| Page layouts | Discount Code, plus the discount pieces added to Campaign and Stripe Transaction. |
| `Discount_Code_Compact` | The highlights panel: code, percent, active, times redeemed. |
| `Discount_Code_Manager` | Full CRUD plus field access. **Assign this to whoever manages codes.** |
| `Discount_Code_Integration_Read` | Read only, for the API user `/api/form/discount-code` runs as. |
| `Discount_Tracking_Integration` | Read codes, write the three `Transaction__c` fields. For the payment service's user. |
| `Office_Staff` queue | Owns the seven-day check chase task. **Deploys with no members - seed it.** |
| `Chase_Pending_Check_Orders` | The scheduled flow that files that task. **Deploys as Draft - activate it.** |
| `Check_Order_Integration` | Write `Manual_Reference__c`. For the payment service's user. |
| `Check_Order_Handling` | See the check fields and untick the chase flag. For the office. |

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

**What the missing assignment looks like in the wild**, because it already
happened once: an order goes through, the buyer is charged the right discounted
amount, the Stripe metadata carries the code - and `Transaction__c` comes back
with `Discount_Code__c`, `Discount_Percent__c` and `Discount_Amount__c` all
blank. No error anywhere, in Salesforce or in the payment service's logs.
Salesforce drops writes to fields the running user cannot see, silently. If the
discount fields are empty on a paid order, check this assignment before anything
else.

`Discount_Code_Integration_Read` grants **read only**. The endpoint looks a code
up and answers yes or no; it never creates, edits or deletes one, so granting
more would only widen what a compromised endpoint could reach. `Notes__c` is
left out of it deliberately - the endpoint has no reason to read it.

No permission set names `Code__c`, `Percent_Off__c` or `Campaign__c`. All three
are required fields, and Salesforce rejects the whole deploy with *"You cannot
deploy to a required field"* if you list one. They are always visible to anyone who can see
the record, so nothing is lost by omitting them - do not "fix" this by adding
them back.

### Layouts

Salesforce generates a layout for a new object that lists every field in one
"Information" section in no useful order - Owner beside Percent Off, the
redemption counter above the dates. The layout here replaces it with sections
that follow how somebody actually sets a code up: **The Code** (what it is and
what it applies to), **When It Applies** (the dates), **Usage** (the cap and the
count), **Internal** (notes, owner).

`Times_Redeemed__c` is **read-only on the layout**. A DLRS rollup owns it, so
anything typed in is overwritten the next time a paid order touches the code; an
editable box would only invite someone to "correct" it.

Three related lists tie the objects together, and all of them are named
`ChildObject.LookupField` in the layout XML - which is how this org already
writes `Transaction__c.Campaign__c` and `Form__c.Campaign__c`, and **not** the
relationship name:

| Where | Related list | Shows |
|---|---|---|
| Discount Code | `Transaction__c.Discount_Code__c` | What this code sold, newest first |
| Campaign (Financial, General) | `Discount_Code__c.Campaign__c` | Codes issued against this campaign |
| Stripe Transaction | *(fields, not a list)* | Discount Code / Percent / Amount, in Summary |

The transaction fields sit in the existing **Summary** section beside
`Amount_Gross__c` rather than in a section of their own: most transactions carry
no discount, and an empty Discount panel on 1,400-odd Stripe transactions is
noise. All three are read-only, because the payment service writes them from
Stripe metadata at the moment of payment and a hand-edit would quietly disagree
with what the buyer was charged.

**Campaign coverage is deliberate but not total.** Revenue-generating campaigns
span three record types - Financial (6), General (7) and Volunteer Campaign (1).
The related list was added to Financial and General. Volunteer Campaign was left
alone: it carries one revenue campaign against 45 that are not, and an empty
Discount Codes card on all 46 is a poor trade. If a code is ever issued against
a volunteer campaign, add the same related list to `Campaign-Volunteer Campaign`.

**A layout deploy replaces the whole component.** Anything absent from the file
is removed from the org, so the Campaign and Transaction layouts in this repo are
the org's own layouts retrieved and edited, never written from scratch. Retrieve
them again before changing them.

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

### Times Redeemed, and the rollup that maintains it

`Times_Redeemed__c` is maintained by a DLRS rollup named **Discount Code Times
Redeemed** (`dlrs__LookupRollupSummary__c`, unique name
`Discount_Code_Times_Redeemed`). Nothing in the order form or the payment
service touches it.

| Setting | Value |
|---|---|
| Parent | `Discount_Code__c` |
| Child | `Transaction__c` |
| Relationship field | `Discount_Code__c` |
| Operation | Count of `Amount_Gross__c` |
| Result field | `Times_Redeemed__c` |
| Criteria | `transaction_type__c = 'charge' AND Status__c IN ('paid','Deposited')` |
| Mode | Realtime, System sharing |

Counting from `Transaction__c` rather than from the browser is the whole point:
a buyer who reaches the payment page and abandons it must not burn a redemption,
and only the payment record knows what was actually paid. The criteria follow
the org's existing Transaction rollups, with two deliberate differences: the
`transaction_type__c = 'charge'` clause keeps payouts and dispute rows out, and
there is no `Is_Revenue_Campaign__c = false` clause - the giving rollups exclude
revenue campaigns because a product sale is not a donation, whereas a discount
code is only ever *on* a revenue campaign, so that clause would zero this out.

A refunded charge becomes `Status__c = 'refunded'` and drops out of the count on
its own, which is right: a refunded order did not consume a redemption.

Realtime works because `dlrs_TransactionTrigger` is already active on
`Transaction__c` and already carries ten other rollups. This adds a rollup, not
a mechanism.

**DLRS only recalculates when a field it watches actually changes** - the
relationship field, the aggregated field, or a criteria field. So creating the
rollup does not backfill existing records, and re-saving a record without
changing any of those fields does nothing. To backfill, use the Calculate button
on the rollup in the DLRS app, or touch the relationship field.

A matching rollup of `Discount_Amount__c` onto `Campaign__c` would give the cost
of a discount programme per campaign. Not set up; it is the same shape.

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
