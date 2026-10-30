// "Use these figures" links: from each calculator, to the ones that take its
// figures on. scripts/links.js writes them into markup/<key>.html as plain
// links (useful to search engines too); src/v2/handoff.js sends the figures as
// one is clicked, and SEND there must list each pair.
//   key: [{ to, text }]
'use strict';

module.exports = {
  'mortgage': [{ to: 'debt-to-income', text: 'See how this repayment affects your debt-to-income ratio' }],
  'emergency-fund': [{ to: 'savings-goal', text: 'Plan how to save the rest of your emergency fund' }],
  'net-worth': [{ to: 'inheritance-tax', text: 'Estimate Inheritance Tax on these assets' }],
  'take-home-pay': [{ to: 'debt-to-income', text: 'Check your debt-to-income ratio on this salary' }],
  'pro-rata-salary': [{ to: 'take-home-pay', text: 'Work out the full take-home pay on this pro rata salary' }],
  'salary-by-age': [{ to: 'take-home-pay', text: 'See your take-home pay on this salary' }],
  'stamp-duty': [
    { to: 'lbtt', text: 'Buying in Scotland? Work out LBTT on this price' },
    { to: 'land-transaction-tax', text: 'Buying in Wales? Work out Land Transaction Tax on this price' },
  ],
  'lbtt': [
    { to: 'stamp-duty', text: 'Buying in England or Northern Ireland? Work out Stamp Duty on this price' },
    { to: 'land-transaction-tax', text: 'Buying in Wales? Work out Land Transaction Tax on this price' },
  ],
  'land-transaction-tax': [
    { to: 'stamp-duty', text: 'Buying in England or Northern Ireland? Work out Stamp Duty on this price' },
    { to: 'lbtt', text: 'Buying in Scotland? Work out LBTT on this price' },
  ],
};
