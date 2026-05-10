require('dotenv').config();
const { sequelize, User, Transaction } = require('./db');

(async () => {
  await sequelize.sync({ force: true });

  const users = [
    { name: 'Admin', email: 'admin@example.com', passwordHash: 'Admin123!', role: 'admin' },
    { name: 'User', email: 'user@example.com', passwordHash: 'User123!', role: 'user' },
    { name: 'ReadOnly', email: 'readonly@example.com', passwordHash: 'ReadOnly123!', role: 'read-only' }
  ];
  for (const u of users) await User.create(u);

  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-based

  const datasets = {
    'admin@example.com': [
      { amount: 5000, type: 'income',  category: 'Salary',        note: 'Salary',        date: new Date(y, m, 1) },
      { amount: 250,  type: 'expense', category: 'Food',          note: 'Groceries',     date: new Date(y, m, 4) },
      { amount: 90,   type: 'expense', category: 'Transport',     note: 'Cab',           date: new Date(y, m, 7) },
      { amount: 4800, type: 'income',  category: 'Salary',        note: 'Last month',    date: new Date(y, m - 1, 1) },
      { amount: 320,  type: 'expense', category: 'Entertainment', note: 'Concert',       date: new Date(y, m - 1, 18) }
    ],
    'user@example.com': [
      { amount: 1200, type: 'income',  category: 'Salary',        note: 'Monthly salary', date: new Date(y, m, 1) },
      { amount: 40,   type: 'expense', category: 'Transport',     note: 'Taxi',           date: today },
      { amount: 15.5, type: 'expense', category: 'Food',          note: 'Lunch',          date: today },
      { amount: 60,   type: 'expense', category: 'Entertainment', note: 'Movies',         date: today },
      { amount: 1100, type: 'income',  category: 'Salary',        note: 'Last month',     date: new Date(y, m - 1, 1) },
      { amount: 200,  type: 'expense', category: 'Food',          note: 'Groceries',      date: new Date(y, m - 1, 12) }
    ],
    'readonly@example.com': [
      { amount: 800, type: 'income',  category: 'Stipend', note: 'Stipend',  date: new Date(y, m, 1) },
      { amount: 25,  type: 'expense', category: 'Food',    note: 'Snacks',   date: new Date(y, m, 3) },
      { amount: 50,  type: 'expense', category: 'Transport', note: 'Bus',    date: new Date(y, m, 9) }
    ]
  };

  for (const [email, txs] of Object.entries(datasets)) {
    const u = await User.findOne({ where: { email } });
    for (const t of txs) await Transaction.create({ ...t, userId: u.id });
  }

  console.log('Seeded. Demo accounts:');
  console.log('  admin@example.com    / Admin123!');
  console.log('  user@example.com     / User123!');
  console.log('  readonly@example.com / ReadOnly123!');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
