import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export const hashValue = async (rawValue) => {
  return await bcrypt.hash(rawValue, SALT_ROUNDS);
};

export const compareValue = async (rawValue, hashedValue) => {
  return await bcrypt.compare(rawValue, hashedValue);
};
