export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle Sequelize Unique Constraint Error
  if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    message = 'Resource already exists with the provided information.';
  }

  // Handle Sequelize Validation Error
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    message = err.errors?.map((e) => e.message).join(', ') || 'Validation error.';
  }

  // Consistent response shape: { success, message, data?, error? }
  const response = {
    success: false,
    message
  };

  if (process.env.NODE_ENV === 'development') {
    response.error = {
      name: err.name,
      stack: err.stack
    };
  }

  res.status(statusCode).json(response);
};
