# Salesforce metadata

Metadata for Salesforce objects this service reads. It lives next to the code
that reads it so the two are edited together; if your org's metadata is managed
centrally elsewhere, move these files there and leave a pointer behind.

**Status:** fully deployed to production (`Refuge International`, org
`00D4x0000050OIqEAM`) and working end to end, verified against a real paid
order. All three permission sets are assigned, and `Times_Redeemed__c` is
maintained by a DLRS rollup - see below.

The check-redemption half is live too: the four fields are deployed, and the
**Count Check Redemptions** flow is Active (v1). Existing codes have a null
`Check_Redemptions__c` rather than 0 - a field default applies only to new
records - which is why `Total_Redemptions__c` wraps both halves in `NULLVALUE`.

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
| `Code__c` | Text(40), external id, **not unique** | What the buyer types. Case-insensitive. Letters, numbers, `-` and `_` only. The same code may appear more than once — see below. |
| `Percent_Off__c` | Number(3,0) | Whole percent off the order subtotal, 1-100. |
| `Active__c` | Checkbox | Untick to kill the code immediately, whatever the dates say. |
| `Start_Date__c` | Date | First day it works, inclusive, US Eastern. Blank = works now. |
| `End_Date__c` | Date | Last day it works, inclusive, US Eastern. Blank = never expires. |
| `Campaign__c` | Lookup(Campaign), required | The financial campaign this code discounts. Restricted to revenue-generating campaigns. |
| `Max_Redemptions__c` | Number(6,0) | Orders allowed before it stops, judged on `Total_Redemptions__c`. Blank = no limit. |
| `Times_Redeemed__c` | Number(6,0) | Orders that have been **paid**. Maintained by a DLRS rollup - see below. |
| `Check_Redemptions__c` | Number(18,0) | Orders placed with a **check promised** and not yet banked. Maintained by a second DLRS rollup - see below. |
| `Total_Redemptions__c` | Formula (Number) | `Times_Redeemed__c + Check_Redemptions__c`. What the cap is actually judged on. |
| `Notes__c` | Long text | Who it went to and why. Internal only - never sent to a browser. |

Three validation rules stop records that would look fine in a list view and fail
silently at the till: a percentage outside 1-100, an end date before the start
date, and a code containing characters the order form strips before it looks the
code up (so the stored code could never be matched).

### One code, several windows

`Code__c` is deliberately **not unique**. A partner keeps their code year after
year while the offer behind it changes, so the same string can exist several
times with different dates and percentages:

| Code | Percent Off | Start | End |
|---|---|---|---|
| `RUSSELLMOORE` | 25 | 2026-09-01 | 2026-09-30 |
| `RUSSELLMOORE` | 15 | 2026-10-01 | 2026-10-31 |

The service reads **every** record for a code and applies the one whose window
contains the day of the order — not the newest, and not whichever row Salesforce
happened to return first. An order placed on 11 September gets 25%; the same code
on 11 October gets 15%.

`Transaction__c.Discount_Code__c` is resolved the same way, against the date the
order was placed rather than the moment the webhook ran. Those differ when an
event is replayed or a bank payment settles late, and on those days the
difference is the whole question.

**Keep the windows apart.** Two records with the same code and overlapping dates
are a data error, and nothing in Salesforce can stop it: a validation rule cannot
compare against other records. The behaviour is still defined rather than
arbitrary — the later-starting window wins — but defined is not the same as
correct, and the reporting will credit a window the buyer was never offered.

When a code needs a new rate, **end the old record first**, then create the new
one starting the following day. Do not edit the percentage on a record that has
already been redeemed: `Percent_Off__c` is what this year's buyers were charged,
and changing it rewrites their history.

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

An order can be placed without paying online. It creates **no payment record of
any kind** — no Stripe session, no `Transaction__c`. It is a `Form__c`
submission like any other order, carrying `PaymentMethod: "Check"` in
`Custom__c`, and that is the only trace the order exists. The office learns a
check is coming from the notification email the submission already sends.

`POST /api/transaction/check` on the payment service, which used to write a
pending transaction here, has been removed.

The three fields below are still deployed and nothing writes them any more. They
are kept rather than dropped: `Manual_Reference__c` still carries the key on the
one transaction created while that endpoint was live.

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

#### The seven-day chase is dormant

`Chase_Pending_Check_Orders` exists and is **deactivated**. Both versions are
Obsolete and no scheduled job remains.

An order paid by check no longer creates a `Transaction__c` at all, so the record
the flow watches for is never written and it would never fire even if it were
switched on. The `Office_Staff` queue, the `Awaiting a Check` list view and the
two helper fields are still deployed alongside it.

None of it was deleted. If the office ever wants the chase back it needs a start
filter rewritten against `Form__c` and one activation, not a rebuild.

**Two things a deploy will not do, worth keeping written down:**

- A queue deploys with **no members**. A queue with no members is a task nobody
  sees. Seed it from Setup, or by creating `GroupMember` rows.
- A flow deploys as **Draft** whatever `<status>` says, because production
  requires flow test coverage to deploy one active. The deploy result says
  Succeeded either way.

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
| `Office_Staff` queue | Owned the check chase task. Still deployed; nothing files into it now. |
| `Chase_Pending_Check_Orders` | The scheduled flow that filed that task. **Deactivated — nothing creates the record it watched for.** |
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

### Check redemptions, and why they need a second rollup

An order paid by check creates **no `Transaction__c` anywhere**. The buyer is
never handed to Stripe, no money moves through the payment pipeline, and the
`Form__c` record is the only trace of the order. So `Times_Redeemed__c`, which
counts transactions, cannot see those orders at all - a code could be claimed
two hundred times while the checks were in the post and still read as unredeemed.

`Check_Redemptions__c` is the other half, counted from `Form__c` by a
record-triggered flow, **Count Check Redemptions**. `Total_Redemptions__c` adds
the two, and that is the number `Max_Redemptions__c` is judged against.

| | |
|---|---|
| Runs on | `Form__c`, after save, create and update |
| Entry criteria | the record has a `Discount_Code__c`, **and** it is new or `Payment_Method__c` or `Discount_Code__c` just changed |
| What it does | counts every `Form__c` on that code with `Payment_Method__c = 'Check'`, and writes the count to `Check_Redemptions__c` |
| Context | System mode without sharing - the count has to be complete regardless of who submitted |

**It recounts rather than incrementing**, which is what makes it self-healing: a
miscount cannot accumulate, because the next order on that code overwrites it
with a fresh count. An incrementing counter drifts and there is no way to tell
that it has.

**The `Payment_Method__c = 'Check'` filter is what stops double counting.** A
card order is already counted on the transaction side, so counting it here too
would count every paid order twice. Which means the office convention matters:
**when a check is banked and recorded as a `Transaction__c` against the same
code, move the order's Payment Method off `Check`.** Leave it, and that order is
counted on both sides. Moving it also re-fires the flow, so the count corrects
itself the moment you do.

**Two fields, not one changed field.** `Times_Redeemed__c` was not widened to
cover checks: the two halves come from two different objects, and each number is
worth being able to read on its own - money that arrived, and money that was
promised.

### Why this one is a flow when every other rollup here is DLRS

DLRS was the obvious choice and it is the wrong one, for a reason worth writing
down so nobody "fixes" it back.

Every DLRS calculation mode except Developer needs a `dlrs_` Apex trigger on the
**child** object - Realtime to roll up on save, Scheduled to mark parents dirty.
The generated trigger is unconditional:

```apex
trigger dlrs_FormTrigger on Form__c
    (before delete, before insert, before update,
     after delete, after insert, after undelete, after update)
{
    dlrs.RollupService.triggerHandler(Form__c.SObjectType);
}
```

That fires managed-package code on **every insert, update and delete of
`Form__c`** - every submission of every form this org runs, not only Hospitality
Guide orders. If DLRS throws, form submissions fail. That is a great deal of
blast radius to accept for a redemption counter.

The flow runs only on records that carry a discount code, and nothing else on
`Form__c` changes shape. `Transaction__c` is the opposite case: the trigger is
already there and already carries eleven rollups, so DLRS costs nothing extra
and `Times_Redeemed__c` stays where it is.

### What the flow does not catch

It fires on create and on a change to `Payment_Method__c` or `Discount_Code__c`.
Two gaps follow, both harmless in practice and both self-correcting:

- **A deleted order.** Deleting a `Form__c` does not re-fire the flow, so the
  count stays one high until the next order on that code recounts. Orders are
  not routinely deleted.
- **An order re-pointed to a different code by hand.** The new code is recounted;
  the old one keeps its old number until something else touches it.

Neither can compound, because every run is a fresh count rather than an
adjustment.

### Where the two new `Form__c` fields come from

| Field | Type | Written by |
|---|---|---|
| `Form__c.Payment_Method__c` | Picklist (Card, Check), restricted | The order form, on every submission. |
| `Form__c.Discount_Code__c` | Lookup(`Discount_Code__c`), delete constraint **Restrict**, related list **Orders** | The order form, when a code was applied. |

**Restrict, not Set Null.** A code that has been used cannot be deleted out from
under its orders. Set Null would blank the link on every order the code ever
discounted, and the reason an order was charged less than list price is not a
thing to lose by accident - it would also silently drop those orders out of
`Check_Redemptions__c`. Retire a code by unticking `Active__c`, which stops it
immediately and keeps the history.

The lookup points at the **window**, not at the code string. `Code__c` is no
longer unique - one code may carry several date windows at different
percentages - so an order has to be filed against the window whose price it was
actually quoted. The discount endpoint returns that window's id when it accepts
a code, and the form echoes it back on submission. Re-resolving the string at
submission time instead would count a buyer who applied at 25% and submitted
after midnight against the 15% window.

That id is the only internal value the discount endpoint returns. It is opaque
and useless without the code it belongs to, which the caller had to know to get
that far; notes and redemption counts stay in Salesforce.

### Enforcing a limit

`Max_Redemptions__c` is blank on all fourteen code records today, which means no
limit. Setting one now enforces against `Total_Redemptions__c` - paid orders and
promised checks together.

The service reads the largest of the counts it can see rather than trusting the
formula alone. Field-level security is per permission set and a query omits what
the running user cannot see, so the raw counts are still a floor; refusing a code
sooner is the right way to be wrong about money.

A cap is **per window**, not per code. `RUSSELLMOORE` at 25% and `RUSSELLMOORE`
at 15% are two records with two counts, so a limit of fifty on each is a hundred
orders, not fifty.
