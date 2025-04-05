import processApprovedPayments from '../scripts/processPayments.js';

/**
 * Middleware that sets up automatic payment processing
 * This will check for approved orders and process them at regular intervals
 */
export function setupPaymentProcessor(interval = 60000) { // Default: check every minute
  console.log(`Setting up automatic payment processor (interval: ${interval}ms)`);
  
  // Process payments immediately on startup
  processApprovedPayments().catch(err => {
    console.error('Error in initial payment processing:', err);
  });
  
  // Set up interval for regular processing
  const processorInterval = setInterval(() => {
    processApprovedPayments().catch(err => {
      console.error('Error in scheduled payment processing:', err);
    });
  }, interval);
  
  // Return middleware function that does nothing but setup was done
  return (req, res, next) => {
    // This middleware doesn't affect request processing
    next();
  };
}

// Add a shutdown function to clean up the interval
export function shutdownPaymentProcessor(interval) {
  if (interval) {
    clearInterval(interval);
  }
} 