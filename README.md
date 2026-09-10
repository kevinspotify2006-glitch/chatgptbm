# Business Manager

A browser-based business empire simulator set in Northgate, a fictional city of
about 640,000 people. You are the owner, not a character on a map: everything
happens through the management interface.

Start with limited capital, find premises, open a business, stock it, staff it,
price it, and try to still be trading next month. Competitors are already in the
city and react to what you do.

## Running it

```bash
npm install
npm run dev        # development server
npm run typecheck  # TypeScript, strict
npm run build      # type check + production build
```

## What is implemented

**City.** Fifteen economically distinct districts with population, density,
income, age mix, foot traffic, tourism, rent and property levels. Around 230
buildings, generated from a fixed seed so the layout is identical in every
playthrough. The map is drawn in code at device pixel density — it stays sharp
at any zoom — and carries seven overlays: commercial, demand, income,
competition, property value and foot traffic.

**Demand.** Nothing is rolled at random. Each hour, every district produces a
pool of customers per business type, shaped by population, demographics, the
hour of the day, the day of the week, the season, consumer confidence and any
city event running. The businesses competing for that pool split it according to
how attractive each one is: location, price against local incomes, product
quality, service, reputation, awareness, premises and size. Outlets the game
does not simulate individually compete as a background market, which is what
stops one corner shop from being handed a whole district's trade.

Because share is computed rather than assigned, a competitor cutting prices
shows up directly as a fall in your sales — and the business panel breaks your
pull apart factor by factor so you can see exactly where you are losing.

**Businesses.** Twenty types across retail, food, services and specialised
trades, all data-driven. Each has its own space requirement, fit-out cost,
product range, staffing profile, throughput per employee, opening hours and
price sensitivity. Adding a new type needs no code.

**Employees.** Skill, experience, productivity, reliability, morale, stress,
loyalty and ten personality traits that change how people perform. Pay below the
market rate and morale falls; work a team too hard and stress climbs; let it run
and people resign. Training raises skill with diminishing returns. Staff decide
how many customers you can serve in an hour and how good the experience is —
which feeds reviews, which feed demand.

**Inventory and procurement.** Six suppliers differing in price, lead time,
reliability, quality, minimum order and volume discounts. The cheapest is never
the best. Stock has weight and volume, storage is finite, perishables spoil, and
anything that will not fit on arrival is credited back. Automatic reordering
plans an order against storage, cash and the supplier's minimum order together.

**Competitors.** Ten AI companies with seven strategic personalities occupy real
buildings, pay real rent and take real share out of the same demand pools. They
watch their own results and the going rate in their district — not your books —
and adjust prices, marketing and expansion accordingly. They open outlets where
money is being made and close ones that keep losing it.

**Money.** Every euro passes through one posting function, so the ledger is
complete and the finance screen is trustworthy. Buying stock is a balance-sheet
movement; cost of goods sold is booked as a non-cash expense when the goods are
sold. Loans have credit requirements, interest and monthly payments; missing one
damages your rating. Corporation tax is charged monthly on profit. Bankruptcy is
possible, and the game tells you which businesses caused it.

**Marketing.** Seven channels that differ in who they reach, not just what they
cost. Awareness saturates as it rises and decays when you stop spending, so an
influencer campaign in a student district is money well spent and the same
campaign in a retirement suburb is not.

**Reports.** What happened, why it moved, and what you could do about it —
category-by-category comparison against the previous day, cost structure as a
share of revenue, and specific advice drawn from the same numbers the simulation
used.

Plus real estate (rent, buy, renovate, sell), thirteen achievements, seven
progression tiers, an optional tutorial that reads live state rather than
scripting you, and save/load/rename/delete with autosave.

## Not yet built

Deliberately absent rather than faked: warehouses and inter-branch logistics,
acquisitions and holding companies, contracts, research and technology,
automatic pricing and scheduling, and a sandbox mode. No button in the interface
leads to a system that does not exist.

## Architecture

```
src/
  sim/     simulation — no file here imports any UI module
  data/    static content: districts, business types, products, suppliers,
           roles, marketing channels, city events
  ui/      application shell, city map renderer, views
tools/     simulate.ts — headless balance harness
```

The simulation runs on a fixed hourly tick. Crossing midnight settles the day
(wages, rent, reviews, reputation, spoilage, economy); day 1 of a week runs
competitor strategy; day 1 of a month runs loans and tax. The same code path
runs at every speed, so 8× produces exactly the same result as 1×.

## Balance harness

```bash
npx tsx tools/simulate.ts [days] [businessType] [cheap|best] [staff] [marketing]
```

Runs the simulation without a browser, playing an average opening and printing
the daily profit and loss, a ledger breakdown and the alerts raised. It is how
the economy is checked: it found the double-counted cost of goods, the daily
profit figure that subtracted revenue twice, the automatic reordering that could
never meet a supplier's minimum, and the demand model that offered one shop a
whole district.

Current results over 90 days, opening on a busy pitch with two staff and modest
marketing, changing nothing afterwards:

| Business          | Profit per day, last 14 days |
| ----------------- | ---------------------------- |
| Convenience store | €197                         |
| Coffee shop       | €508                         |
| Clothing store    | €663                         |
| Repair company    | €417                         |
| Pet store         | €97                          |
| Cleaning company  | €78                          |

The same openings on the cheapest available premises lose money, which is the
point: location is a decision, not a formality.
