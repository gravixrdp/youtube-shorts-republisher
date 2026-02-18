import cron from 'node-cron';

const MAIN_APP_URL = process.env.MAIN_APP_URL || 'http://localhost:3000';
const SCHEDULER_PORT = 3002;

// Store scheduler state in memory
let isRunning = false;
let lastRunTime: Date | null = null;

console.log('📅 YouTube Shorts Scheduler Service Started');
console.log(`🔗 Main App URL: ${MAIN_APP_URL}`);
console.log(`🔌 Scheduler Port: ${SCHEDULER_PORT}`);

// Helper function to make API calls to main app
async function callMainApp(endpoint: string, method: string = 'GET', body?: any) {
  try {
    const response = await fetch(`${MAIN_APP_URL}/api${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    return { success: false, error: 'Failed to connect to main app' };
  }
}

// Check if automation is enabled and run uploads
async function checkAndRunUploads() {
  if (isRunning) {
    console.log('⏳ Scheduler already running, skipping...');
    return;
  }
  
  try {
    isRunning = true;
    console.log('🔍 Checking for pending uploads...');
    
    // Get configuration
    const configResult = await callMainApp('/config');
    const config = configResult.config || {};
    
    // Check if automation is enabled
    if (config.automation_enabled !== 'true') {
      console.log('⏸️ Automation is disabled');
      return;
    }
    
    // Get uploads per day
    const uploadsPerDay = parseInt(config.uploads_per_day || '2');
    
    // Get scheduler state
    const stateResult = await callMainApp('/scheduler');
    const state = stateResult.state;
    
    // Check if daily limit reached
    if (state && state.uploads_today >= uploadsPerDay) {
      console.log('📊 Daily upload limit reached');
      return;
    }
    
    // Run uploads
    console.log('🚀 Starting scheduled uploads...');
    
    const remainingUploads = uploadsPerDay - (state?.uploads_today || 0);
    
    for (let i = 0; i < remainingUploads; i++) {
      const result = await callMainApp('/scheduler', 'POST', { 
        action: 'process_next' 
      });
      
      if (!result.success) {
        console.log('❌ Upload failed:', result.message);
        break;
      }
      
      console.log('✅ Upload successful:', result.videoId);
      
      // Wait between uploads to avoid rate limiting
      if (i < remainingUploads - 1) {
        console.log('⏳ Waiting 2 minutes before next upload...');
        await new Promise(resolve => setTimeout(resolve, 120000));
      }
    }
    
    lastRunTime = new Date();
    console.log('✨ Scheduler run completed at:', lastRunTime.toISOString());
    
  } catch (error) {
    console.error('❌ Scheduler error:', error);
  } finally {
    isRunning = false;
  }
}

// Reset daily counter at midnight
async function resetDailyCounter() {
  console.log('🔄 Resetting daily upload counter...');
  await callMainApp('/scheduler', 'POST', {
    action: 'update',
    isRunning: false,
    uploadsToday: 0
  });
}

// Schedule: Run uploads at configured times
// Morning upload: 9:00 AM
cron.schedule('0 9 * * *', () => {
  console.log('🕘 Morning upload scheduled');
  checkAndRunUploads();
}, {
  timezone: 'UTC'
});

// Evening upload: 6:00 PM
cron.schedule('0 18 * * *', () => {
  console.log('🕕 Evening upload scheduled');
  checkAndRunUploads();
}, {
  timezone: 'UTC'
});

// Reset daily counter at midnight
cron.schedule('0 0 * * *', () => {
  resetDailyCounter();
}, {
  timezone: 'UTC'
});

// Health check every 5 minutes
cron.schedule('*/5 * * * *', () => {
  console.log('💚 Health check - Scheduler is running');
  console.log(`   Last run: ${lastRunTime ? lastRunTime.toISOString() : 'Never'}`);
  console.log(`   Currently running: ${isRunning}`);
});

// Manual trigger endpoint (simple HTTP server)
const server = Bun.serve({
  port: SCHEDULER_PORT,
  async fetch(req) {
    const url = new URL(req.url);
    
    if (url.pathname === '/health') {
      return Response.json({
        status: 'healthy',
        isRunning,
        lastRunTime: lastRunTime?.toISOString() || null
      });
    }
    
    if (url.pathname === '/trigger' && req.method === 'POST') {
      if (isRunning) {
        return Response.json({ 
          success: false, 
          message: 'Scheduler is already running' 
        });
      }
      
      // Run async
      checkAndRunUploads();
      
      return Response.json({ 
        success: true, 
        message: 'Scheduler triggered' 
      });
    }
    
    if (url.pathname === '/status') {
      const configResult = await callMainApp('/config');
      const stateResult = await callMainApp('/scheduler');
      
      return Response.json({
        scheduler: {
          isRunning,
          lastRunTime: lastRunTime?.toISOString() || null
        },
        config: configResult.config,
        state: stateResult.state
      });
    }
    
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
});

console.log(`🌐 Scheduler HTTP server running on port ${SCHEDULER_PORT}`);
console.log('📋 Available endpoints:');
console.log('   GET  /health - Health check');
console.log('   POST /trigger - Manually trigger upload run');
console.log('   GET  /status - Get scheduler status');
