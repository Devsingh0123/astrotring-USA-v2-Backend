import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";

export const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    is_email_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    onboarding_completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    role: {
      type: DataTypes.ENUM("user", "admin"),
      allowNull: false,
      defaultValue: "user",
    },
    is_blocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Number of Jyotish consultation credits available (every new user starts with 1 free question)
    credit_balance: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Number of Deep Report credits available
    report_credits: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // User's active membership/pack tier
    tier: {
      type: DataTypes.ENUM("free", "silver", "gold", "diamond"),
      allowNull: false,
      defaultValue: "free",
    },
  },
  {
    tableName: "users",
    timestamps: true,
    paranoid: true,
    underscored: true,
  },
);
