const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

const formatUser = (user) => {
  if (!user) return null;

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    password: user.password,
    created_at: user.created_at
  };
};

const createUser = async ({ name, email, password }) => {
  const user = await User.create({ name, email, password });
  return user._id.toString();
};

const findUserByEmail = async (email) => {
  const user = await User.findOne({ email }).lean();
  return formatUser(user);
};

const findUserById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }

  const user = await User.findById(id).lean();
  return formatUser(user);
};

module.exports = {
  createUser,
  findUserByEmail,
  findUserById
};
