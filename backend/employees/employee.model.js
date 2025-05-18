const { DataTypes } = require('sequelize');

module.exports = model;

function model(sequelize) {
  const attributes = {
    employeeId: { type: DataTypes.STRING, allowNull: false, unique: true },
    position: { type: DataTypes.STRING, allowNull: false },
    hireDate: { type: DataTypes.DATE, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  };
  
  const options = {
    timestamps: false 
  };

  return sequelize.define('employee', attributes, options);
}
