const path = require('path');
const bcrypt = require('bcrypt');
const { Sequelize, DataTypes } = require('sequelize');

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, { logging: false })
  : new Sequelize({
      dialect: 'sqlite',
      storage: path.join(__dirname, 'data', 'dev.sqlite'),
      logging: false
    });

const User = sequelize.define('User', {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'user', 'read-only'), defaultValue: 'user' }
}, { tableName: 'users' });

User.prototype.verifyPassword = function (pw) {
  return bcrypt.compare(pw, this.passwordHash);
};

User.beforeCreate(async (u) => {
  if (u.passwordHash && !u.passwordHash.startsWith('$2')) {
    u.passwordHash = await bcrypt.hash(u.passwordHash, 10);
  }
});

const Transaction = sequelize.define('Transaction', {
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  type: { type: DataTypes.ENUM('income', 'expense'), allowNull: false },
  category: { type: DataTypes.STRING, allowNull: false },
  note: { type: DataTypes.STRING },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'transactions' });

User.hasMany(Transaction, { foreignKey: 'userId' });
Transaction.belongsTo(User, { foreignKey: 'userId' });

module.exports = { sequelize, User, Transaction };
