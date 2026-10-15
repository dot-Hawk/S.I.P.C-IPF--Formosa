import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGO_URI is not defined in the environment");
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");
};
