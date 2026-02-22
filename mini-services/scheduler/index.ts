import cron from 'node-cron';

const MAIN_APP_URL = process.env.MAIN_APP_URL || 'http://127.0.0.1:3000';
const SCHEDULER_PORT = Number(process.env.SCHEDULER_PORT || '3002');
const SCHEDULER_HOST = process.env.SCHEDULER_HOST || '0.0.0.0';

// Store scheduler state in memory
let isRunning = false;
let lastRunTime: Date | null = null;
let lastScheduleTriggerKey: string | null = null;

console.log('📅 YouTube Shorts Scheduler Service Started');
console.log(`🔗 Main App URL: ${MAIN_APP_URL}`);
console.log(`📡 Scheduler Host: ${SCHEDULER_HOST}`);
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

function normalizeTimeValue(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') {
    return fallback;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : fallback;
}

function getUtcTimeValue(date: Date): string {
  return date.toISOString().slice(11, 16);
}

function getUtcDateValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDateTimeInTimezone(date: Date, timeZone: string): { date: string; time: string } {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const partMap = new Map(parts.map((part) => [part.type, part.value]));
    const year = partMap.get('year') || '0000';
    const month = partMap.get('month') || '01';
    const day = partMap.get('day') || '01';
    const hour = partMap.get('hour') || '00';
    const minute = partMap.get('minute') || '00';

    return {
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}`,
    };
  } catch {
    return {
      date: getUtcDateValue(date),
      time: getUtcTimeValue(date),
    };
  }
}

// Check if automation is enabled and run uploads
async function checkAndRunUploads(prefetchedConfig?: Record<string, string>) {
  if (isRunning) {
    console.log('⏳ Scheduler already running, skipping...');
    return;
  }
  
  try {
    isRunning = true;
    console.log('🔍 Checking for pending uploads...');
    
    // Get configuration
    const configResult = prefetchedConfig ? { config: prefetchedConfig } : await callMainApp('/config');
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
    
    // Run one upload per schedule trigger.
    console.log('🚀 Starting scheduled upload...');
    
    const result = await callMainApp('/scheduler', 'POST', { 
      action: 'process_next' 
    });
    
    if (!result.success) {
      console.log('❌ Upload failed:', result.message);
    } else {
      console.log('✅ Upload successful:', result.videoId);
    }

    await callMainApp('/scheduler', 'POST', {
      action: 'cleanup_uploaded'
    });
    
    lastRunTime = new Date();
    console.log('✨ Scheduler run completed at:', lastRunTime.toISOString());
    
  } catch (error) {
    console.error('❌ Scheduler error:', error);
  } finally {
    isRunning = false;
  }
}

async function checkConfiguredTimeSlots() {
  const configResult = await callMainApp('/config');
  const config = configResult.config || {};

  if (config.automation_enabled !== 'true') {
    return;
  }

  const rawTimezone = typeof config.scheduler_timezone === 'string' ? config.scheduler_timezone.trim() : 'UTC';
  const schedulerTimezone = rawTimezone || 'UTC';
  const morningTime = normalizeTimeValue(config.upload_time_morning, '09:00');
  const eveningTime = normalizeTimeValue(config.upload_time_evening, '18:00');
  const now = new Date();
  const nowInTimezone = getDateTimeInTimezone(now, schedulerTimezone);
  const nowTime = nowInTimezone.time;

  const matchingSlots: string[] = [];
  if (nowTime === morningTime) {
    matchingSlots.push(`morning@${morningTime}`);
  }
  if (nowTime === eveningTime) {
    matchingSlots.push(`evening@${eveningTime}`);
  }

  if (matchingSlots.length === 0) {
    return;
  }

  const triggerKey = `${schedulerTimezone}:${nowInTimezone.date}:${matchingSlots.join('|')}`;
  if (lastScheduleTriggerKey === triggerKey) {
    return;
  }

  lastScheduleTriggerKey = triggerKey;
  console.log(`🕒 Matched configured slot (${matchingSlots.join(', ')}) [tz=${schedulerTimezone}], triggering upload check...`);
  await checkAndRunUploads(config);
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

// Check configured schedule every minute (UTC).
cron.schedule('* * * * *', () => {
  checkConfiguredTimeSlots().catch((error) => {
    console.error('Configured schedule check failed:', error);
  });
}, {
  timezone: 'UTC'
});

// Reset daily counter at midnight
cron.schedule('0 0 * * *', () => {
  resetDailyCounter();
}, {
  timezone: 'UTC'
});

// Cleanup uploaded shorts every 30 minutes.
cron.schedule('*/30 * * * *', () => {
  callMainApp('/scheduler', 'POST', {
    action: 'cleanup_uploaded'
  });
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
  hostname: SCHEDULER_HOST,
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

console.log(`🌐 Scheduler HTTP server running on http://${SCHEDULER_HOST}:${SCHEDULER_PORT}`);
console.log('📋 Available endpoints:');
console.log('   GET  /health - Health check');
console.log('   POST /trigger - Manually trigger upload run');
console.log('   GET  /status - Get scheduler status');
