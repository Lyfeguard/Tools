// The worked example at the end of each calculator: real figures in the page
// HTML, for search engines, AI answers and anyone reading without using the
// calculator. scripts/examples.js runs each calculator with these steps and
// writes the result into markup/<key>.html, so the figures are always the
// calculator's own (test/examples.test.js fails if they're out of date).
//
//   title    the section heading
//   steps    as in test/scenarios.js
//   text(v)  the paragraph(s); v(id) is the text of the element with that id
//   sources  where the rates and figures come from (shown under the example)
'use strict';

const TAX = 'HMRC Income Tax rates and allowances and National Insurance rates for 2026/27';
const SL = 'Student Loans Company repayment thresholds for 2026/27';

module.exports = {
  mortgage: {
    title: 'Worked example: a \u00A3280,000 repayment mortgage',
    steps: [['fill', '#lgmc-price', '350,000'], ['fill', '#lgmc-deposit', '70,000'], ['fill', '#lgmc-rate', '4.5'], ['fill', '#lgmc-term', '25']],
    text: (v) => [
      `Buying a \u00A3350,000 home with a \u00A370,000 deposit means borrowing ${v('lgmc-loan')} (${v('lgmc-ltv')} loan-to-value). At 4.5% over 25 years on a repayment mortgage, the monthly payment is ${v('lgmc-monthly')}.`,
      `Over the full term that's ${v('lgmc-interest')} in interest and ${v('lgmc-total')} repaid in total. At 3.5% the payment would be ${v('lgmc-lower')} a month; at 5.5%, ${v('lgmc-higher')}.`,
    ],
    sources: [],
  },
  'loan-repayment': {
    title: 'Worked example: a \u00A310,000 loan over 5 years',
    steps: [['fill', '#lglc-amount', '10,000'], ['fill', '#lglc-rate', '7.5'], ['fill', '#lglc-term', '5']],
    text: (v) => [
      `Borrowing \u00A310,000 at 7.5% a year over 5 years costs ${v('lglc-monthly')} a month. You'd repay ${v('lglc-total')} in total, of which ${v('lglc-interest')} is interest.`,
      `At 6.5% the payment would be ${v('lglc-lower')} a month; at 8.5%, ${v('lglc-higher')}.`,
    ],
    sources: [],
  },
  'compound-interest': {
    title: 'Worked example: \u00A35,000 plus \u00A3200 a month for 10 years',
    steps: [['fill', '#lgci-initial', '5,000'], ['fill', '#lgci-contribution', '200'], ['fill', '#lgci-rate', '5'], ['fill', '#lgci-years', '10']],
    text: (v) => [
      `Starting with \u00A35,000 and adding \u00A3200 at the end of each month, growing at 5% a year, gives an estimated ${v('lgci-future')} after 10 years.`,
      `You'd have put in ${v('lgci-invested')}, and ${v('lgci-growth')} would come from compound growth. At 4% the balance would be ${v('lgci-lower')}; at 6%, ${v('lgci-higher')}.`,
    ],
    sources: [],
  },
  'savings-goal': {
    title: 'Worked example: saving \u00A310,000 in 2\u00BD years',
    steps: [['fill', '#sg-goal', '10,000'], ['fill', '#sg-initial', '1000'], ['fill', '#sg-years', '2'], ['fill', '#sg-months', '6'], ['fill', '#sg-rate', '4']],
    text: (v) => [
      `To reach \u00A310,000 in 2 years and 6 months, starting with \u00A31,000 in an account paying 4% AER, you'd need to save ${v('sg-result-value')} a month.`,
      `You'd pay in ${v('sg-out-contributions')} on top of your starting \u00A31,000, and earn ${v('sg-out-interest')} in interest.`,
    ],
    sources: [],
  },
  'emergency-fund': {
    title: 'Worked example: a 6-month emergency fund',
    steps: [['fill', '#ef-monthly', '2,000'], ['check', 'input[name="ef-months"][value="6"]'], ['fill', '#ef-saved', '4500']],
    text: (v) => [
      `With essential costs of \u00A32,000 a month and one income in the household, a 6-month emergency fund is ${v('ef-target')}.`,
      `With \u00A34,500 already saved, that's ${v('ef-st-gap')} still to save: about ${v('ef-p12')} for 12 months, or ${v('ef-p24')} over 2 years.`,
    ],
    sources: ['MoneyHelper guidance on emergency savings'],
  },
  'net-worth': {
    title: 'Worked example: a homeowner with a mortgage',
    steps: [['fill', '#lgnw-current-accounts', '2,500'], ['fill', '#lgnw-cash', '12500'], ['fill', '#lgnw-isa', '20000'], ['fill', '#lgnw-pensions', '85000'], ['fill', '#lgnw-property', '350000'], ['fill', '#lgnw-vehicles', '12000'], ['fill', '#lgnw-mortgage', '245000'], ['fill', '#lgnw-car-finance', '7500'], ['fill', '#lgnw-credit-cards', '1250.50'], ['fill', '#lgnw-student-loan', '30000']],
    text: (v) => [
      `Someone with a \u00A3350,000 home, \u00A385,000 in pensions, \u00A335,000 in cash, savings and ISAs and a \u00A312,000 car has ${v('lgnw-assets-total')} of assets.`,
      `Take away a \u00A3245,000 mortgage, \u00A37,500 car finance, \u00A31,250.50 on credit cards and a \u00A330,000 student loan (${v('lgnw-liabilities-total')} in all) and their net worth is ${v('lgnw-net-worth')}.`,
    ],
    sources: [],
  },
  'inheritance-tax': {
    title: 'Worked example: a \u00A3500,000 estate',
    steps: [['fill', '#lgiht-cash', '500000'], ['select', '#lgiht-home-desc', 'no'], ['select', '#lgiht-transfer', 'no']],
    text: (v) => [
      `An estate worth \u00A3500,000, with no home passing to children or grandchildren and no unused allowance from a late spouse, has the ${v('lgiht-nrb-max')} standard tax-free allowance (nil-rate band).`,
      `The remaining ${v('lgiht-taxable')} is taxed at 40%, so the estimated Inheritance Tax is ${v('lgiht-tax')}, ${v('lgiht-effective-rate')} of the estate.`,
    ],
    sources: ['HMRC Inheritance Tax thresholds for 2026/27'],
  },
  'debt-to-income': {
    title: 'Worked example: \u00A345,000 salary with a mortgage, car finance and a credit card',
    steps: [['fill', '#lgdti-income', '45,000'], ['fill', '#lgdti-housing', '1,100'], ['fill', '#lgdti-car', '250'], ['fill', '#lgdti-cards', '75.50']],
    text: (v) => [
      `On a gross salary of \u00A345,000 (${v('lgdti-monthly-income')} a month), monthly repayments of \u00A31,100 for a mortgage, \u00A3250 car finance and \u00A375.50 on credit cards come to ${v('lgdti-monthly-debt')}.`,
      `That's a debt-to-income ratio of ${v('lgdti-ratio')}, or ${v('lgdti-ratio-ex-housing')} without the mortgage.`,
    ],
    sources: [],
  },
  'take-home-pay': {
    title: 'Worked example: take-home pay on \u00A335,000',
    steps: [['fill', '#lgth-salary', '35,000']],
    text: (v) => [
      `On a salary of \u00A335,000 in England, Wales or Northern Ireland, paying 5% into a workplace pension and with no student loan, take-home pay is ${v('lgth-headline')} a month (${v('lgth-year')} a year).`,
      `Income Tax, National Insurance and the pension take ${v('lgth-deductions')} a year, so you keep ${v('lgth-keep')} of your pay. A rise to \u00A340,000 would add ${v('lgth-rise1').replace(/^\+/, '')}.`,
    ],
    sources: [TAX, SL],
  },
  'pro-rata-salary': {
    title: 'Worked example: 3 days a week on a \u00A355,000 salary',
    steps: [['fill', '#pr-salary', '55,000'], ['check', 'input[name="pr-mode"][value="days"]'], ['fill', '#pr-full', '5'], ['fill', '#pr-yours', '3']],
    text: (v) => [
      `Working 3 days of a 5-day week in a job with a \u00A355,000 full-time salary pays ${v('pr-salary-out')} a year pro rata.`,
      `After tax, National Insurance and a 5% pension, take-home is ${v('pr-pt-net')}, against ${v('pr-ft-net')} full time: you'd work 60% of the time and keep ${v('pr-bar-pay-val')} of the take-home pay.`,
    ],
    sources: [TAX],
  },
  'salary-by-age': {
    title: 'Worked example: a woman aged 22 to 29 earning \u00A328,500',
    steps: [['check', 'input[name="sa-age"][value="22-29"]'], ['fill', '#sa-salary', '28,500'], ['check', 'input[name="sa-who2"][value="female"]']],
    text: (v) => [
      `A woman aged 22 to 29 earning \u00A328,500 full time earns more than about ${v('sa-value')} of women working full time in her age group.`,
      `The median for the group is ${v('sa-st-median')}, and the top 10% earn ${v('sa-top10')} or more.`,
    ],
    sources: ['ONS Annual Survey of Hours and Earnings (ASHE) 2026 provisional, Table 6.7a', TAX],
  },
  'retirement-income': {
    title: 'Worked example: \u00A3300,000 pension pot from age 60',
    steps: [['fill', '#lgri-pot', '300,000'], ['fill', '#lgri-age', '60'], ['fill', '#lgri-target', '25000']],
    text: (v) => [
      `Taking \u00A325,000 a year before tax from a \u00A3300,000 pension pot from age 60, with the full State Pension from 67, 4% growth and 2.5% inflation, the pot would last until ${v('lgri-headline').replace(/^Age/, 'age')}.`,
      `To make it last to age 95, the income would need to be about ${v('lgri-sustainable')}.`,
    ],
    sources: ['HMRC Income Tax rates and the Lump Sum Allowance for 2026/27', 'the full new State Pension for 2026/27'],
  },
};
