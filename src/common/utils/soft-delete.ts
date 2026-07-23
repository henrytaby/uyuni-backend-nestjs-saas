/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
export function convertToSoftDelete(args: any, userId?: string | null) {
  // Changes a delete or deleteMany operation into an update or updateMany operation
  // setting isActive: false and deletedById to the provided userId
  const newArgs = { ...args };

  if (userId) {
    newArgs.data = { ...newArgs.data, isActive: false, deletedById: userId };
  } else {
    newArgs.data = { ...newArgs.data, isActive: false };
  }

  return newArgs;
}
