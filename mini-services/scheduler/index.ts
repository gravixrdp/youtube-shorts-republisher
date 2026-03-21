import cron from "node-cron";

const MAIN_APP_URL = process.env.MAIN_APP_URL || "http://127.0.0.1:3000";
const SCHEDULER_PORT = Number(process.env.SCHEDULER_PORT || "3002");
const SCHEDULER_HOST = process.env.SCHEDULER_HOST || "0.0.0.0";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const FIRED_KEYS_CONFIG_KEY = "scheduler_fired_trigger_keys";

interface SchedulerJob {
    mappingId?: string;
    mappingName?: string;
    slotLabel: string;
    slotTime: string;
}

interface MappingScheduleConfig {
    id: string;
    name?: string;
    uploads_per_day?: number;
    upload_time_morning?: string | null;
    upload_time_evening?: string | null;
}

// Store scheduler state in memory (persisted to Supabase config table)
let isRunning = false;
let lastRunTime: Date | null = null;
const firedTriggerKeys = new Map<string, number>();

// ── Supabase persistence helpers ──────────────────────────────────────────────

async function supabaseFetch(
    path: string,
    options: RequestInit = {},
): Promise<any> {
    if (!SUPABASE_URL || !SUPABASE_KEY) return null;
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
            ...options,
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
        });
        if (!res.ok) return null;
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

async function loadFiredKeysFromDB(): Promise<void> {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.log(
            "⚠️  Supabase not configured — fired keys will be in-memory only",
        );
        return;
    }
    try {
        const data = await supabaseFetch(
            `/config?key=eq.${FIRED_KEYS_CONFIG_KEY}&select=value`,
        );
        if (Array.isArray(data) && data[0]?.value) {
            const keys = JSON.parse(data[0].value) as Record<string, number>;
            const nowMs = Date.now();
            const maxAgeMs = 3 * 24 * 60 * 60 * 1000;
            let loaded = 0;
            for (const [key, ts] of Object.entries(keys)) {
                if (nowMs - (ts as number) < maxAgeMs) {
                    firedTriggerKeys.set(key, ts as number);
                    loaded++;
                }
            }
            console.log(
                `📥 Loaded ${loaded} fired trigger keys from Supabase DB`,
            );
        } else {
            console.log(
                "📥 No fired trigger keys found in DB — starting fresh",
            );
        }
    } catch (e) {
        console.error("❌ Failed to load fired keys from DB:", e);
    }
}

async function saveFiredKeysToDB(): Promise<void> {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    try {
        const keysObj = Object.fromEntries(firedTriggerKeys.entries());
        await supabaseFetch(`/config?on_conflict=key`, {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify({
                key: FIRED_KEYS_CONFIG_KEY,
                value: JSON.stringify(keysObj),
            }),
        });
    } catch (e) {
        console.error("❌ Failed to save fired keys to DB:", e);
    }
}

console.log("📅 YouTube Shorts Scheduler Service Started");
console.log(`🔗 Main App URL: ${MAIN_APP_URL}`);
console.log(`📡 Scheduler Host: ${SCHEDULER_HOST}`);
console.log(`🔌 Scheduler Port: ${SCHEDULER_PORT}`);
console.log(
    `🗄️  Supabase: ${SUPABASE_URL ? "✅ Connected" : "⚠️  Not configured"}`,
);

// Load persisted fired trigger keys from Supabase on startup
loadFiredKeysFromDB().catch(console.error);

// Helper function to make API calls to main app
async function callMainApp(
    endpoint: string,
    method: string = "GET",
    body?: any,
) {
    try {
        const response = await fetch(`${MAIN_APP_URL}/api${endpoint}`, {
            method,
            headers: {
                "Content-Type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        return await response.json();
    } catch (error) {
        console.error("API call failed:", error);
        return { success: false, error: "Failed to connect to main app" };
    }
}

function normalizeTimeValue(raw: unknown, fallback: string): string {
    if (typeof raw !== "string") {
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

function getDateTimeInTimezone(
    date: Date,
    timeZone: string,
): { date: string; time: string } {
    try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });

        const parts = formatter.formatToParts(date);
        const partMap = new Map(parts.map((part) => [part.type, part.value]));
        const year = partMap.get("year") || "0000";
        const month = partMap.get("month") || "01";
        const day = partMap.get("day") || "01";
        const hour = partMap.get("hour") || "00";
        const minute = partMap.get("minute") || "00";

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

function cleanupTriggerCache(nowMs: number): boolean {
    const maxAgeMs = 3 * 24 * 60 * 60 * 1000;
    let changed = false;
    for (const [key, timestamp] of firedTriggerKeys.entries()) {
        if (nowMs - timestamp > maxAgeMs) {
            firedTriggerKeys.delete(key);
            changed = true;
        }
    }
    return changed;
}

async function shouldFireTrigger(triggerKey: string): Promise<boolean> {
    const nowMs = Date.now();
    const cleaned = cleanupTriggerCache(nowMs);

    if (firedTriggerKeys.has(triggerKey)) {
        return false;
    }

    firedTriggerKeys.set(triggerKey, nowMs);
    // Persist to Supabase (cleanup may have freed old keys too)
    await saveFiredKeysToDB();
    return true;
}

async function runSchedulerJobs(
    jobs: SchedulerJob[],
    options?: {
        prefetchedConfig?: Record<string, string>;
        requireAutomation?: boolean;
    },
) {
    if (jobs.length === 0) {
        return;
    }

    if (isRunning) {
        console.log("⏳ Scheduler already running, skipping...");
        return;
    }

    try {
        isRunning = true;
        const configResult = options?.prefetchedConfig
            ? { config: options.prefetchedConfig }
            : await callMainApp("/config");
        const config = configResult.config || {};
        const requireAutomation = options?.requireAutomation !== false;

        if (requireAutomation && config.automation_enabled !== "true") {
            console.log("⏸️ Automation is disabled");
            return;
        }

        console.log(
            `🚀 Starting scheduled batch (${jobs.length} job${jobs.length > 1 ? "s" : ""})...`,
        );

        for (const job of jobs) {
            const payload: Record<string, unknown> = { action: "process_next" };
            if (job.mappingId) {
                payload.mappingId = job.mappingId;
            }

            const target = job.mappingName
                ? `${job.mappingName} (${job.mappingId})`
                : "global queue";
            console.log(
                `🧭 Triggering ${target} at ${job.slotTime} [${job.slotLabel}]`,
            );

            const result = await callMainApp("/scheduler", "POST", payload);
            if (!result.success) {
                console.log(
                    "❌ Upload skipped/failed:",
                    result.message || result.error || "Unknown error",
                );
            } else {
                console.log("✅ Upload successful:", result.videoId);
            }
        }

        const publishResult = await callMainApp("/scheduler", "POST", {
            action: "publish_due",
            limit: 20,
        });

        const publishStats = publishResult?.publish;
        if (
            publishStats &&
            (publishStats.published > 0 || publishStats.failed > 0)
        ) {
            console.log(
                `📣 Delayed publish check: checked=${publishStats.checked}, published=${publishStats.published}, failed=${publishStats.failed}`,
            );
        }

        await callMainApp("/scheduler", "POST", {
            action: "cleanup_uploaded",
        });

        lastRunTime = new Date();
        console.log(
            "✨ Scheduler batch completed at:",
            lastRunTime.toISOString(),
        );
    } catch (error) {
        console.error("❌ Scheduler error:", error);
    } finally {
        isRunning = false;
    }
}

// Check if automation is enabled and run one global queue upload.
async function checkAndRunUploads(prefetchedConfig?: Record<string, string>) {
    await runSchedulerJobs(
        [
            {
                slotLabel: "manual",
                slotTime: "manual",
            },
        ],
        {
            prefetchedConfig,
            requireAutomation: false,
        },
    );
}

async function checkConfiguredTimeSlots() {
    const configResult = await callMainApp("/config");
    const config = configResult.config || {};

    if (config.automation_enabled !== "true") {
        return;
    }

    const rawTimezone =
        typeof config.scheduler_timezone === "string"
            ? config.scheduler_timezone.trim()
            : "UTC";
    const schedulerTimezone = rawTimezone || "UTC";
    const globalMorningTime = normalizeTimeValue(
        config.upload_time_morning,
        "09:00",
    );
    const globalEveningTime = normalizeTimeValue(
        config.upload_time_evening,
        "18:00",
    );

    const now = new Date();
    const nowInTimezone = getDateTimeInTimezone(now, schedulerTimezone);
    const nowTime = nowInTimezone.time;

    const mappingsResponse = await callMainApp("/mappings?active=true");
    const mappings: MappingScheduleConfig[] = Array.isArray(
        mappingsResponse?.mappings,
    )
        ? mappingsResponse.mappings
        : [];

    const jobs: SchedulerJob[] = [];

    for (const mapping of mappings) {
        if (!mapping?.id) {
            continue;
        }

        const mappingMorning = normalizeTimeValue(
            mapping.upload_time_morning,
            globalMorningTime,
        );
        const mappingEvening = normalizeTimeValue(
            mapping.upload_time_evening,
            globalEveningTime,
        );

        const slotCandidates: Array<{ label: string; time: string }> = [
            { label: "morning", time: mappingMorning },
        ];

        if (mappingEvening !== mappingMorning) {
            slotCandidates.push({ label: "evening", time: mappingEvening });
        }

        for (const slot of slotCandidates) {
            if (slot.time !== nowTime) {
                continue;
            }

            const triggerKey = `${schedulerTimezone}:${nowInTimezone.date}:${mapping.id}:${slot.label}@${slot.time}`;
            if (!(await shouldFireTrigger(triggerKey))) {
                continue;
            }

            jobs.push({
                mappingId: mapping.id,
                mappingName: mapping.name || mapping.id,
                slotLabel: slot.label,
                slotTime: slot.time,
            });
        }
    }

    if (jobs.length === 0) {
        const globalSlots: Array<{ label: string; time: string }> = [
            { label: "global-morning", time: globalMorningTime },
        ];
        if (globalEveningTime !== globalMorningTime) {
            globalSlots.push({
                label: "global-evening",
                time: globalEveningTime,
            });
        }

        for (const slot of globalSlots) {
            if (slot.time !== nowTime) {
                continue;
            }

            const triggerKey = `${schedulerTimezone}:${nowInTimezone.date}:global:${slot.label}@${slot.time}`;
            if (!(await shouldFireTrigger(triggerKey))) {
                continue;
            }

            jobs.push({
                slotLabel: slot.label,
                slotTime: slot.time,
            });
        }
    }

    if (jobs.length === 0) {
        return;
    }

    const labels = jobs
        .map((job) => `${job.mappingName || "global"}@${job.slotTime}`)
        .join(", ");

    console.log(
        `🕒 Matched configured slot(s): ${labels} [tz=${schedulerTimezone}]`,
    );
    await runSchedulerJobs(jobs, {
        prefetchedConfig: config,
        requireAutomation: true,
    });
}

async function checkDelayedPublishQueue() {
    const result = await callMainApp("/scheduler", "POST", {
        action: "publish_due",
        limit: 20,
    });

    const publish = result?.publish;
    if (publish && (publish.published > 0 || publish.failed > 0)) {
        console.log(
            `📣 Delayed publish queue: checked=${publish.checked}, published=${publish.published}, failed=${publish.failed}`,
        );
    }
}

// Reset daily counter at midnight
async function resetDailyCounter() {
    console.log("🔄 Resetting daily upload counter...");
    await callMainApp("/scheduler", "POST", {
        action: "update",
        isRunning: false,
        uploadsToday: 0,
    });
}

// Check configured schedule and delayed publish queue every minute.
cron.schedule(
    "* * * * *",
    () => {
        checkConfiguredTimeSlots().catch((error) => {
            console.error("Configured schedule check failed:", error);
        });

        checkDelayedPublishQueue().catch((error) => {
            console.error("Delayed publish check failed:", error);
        });
    },
    {
        timezone: "UTC",
    },
);

// Reset daily counter at midnight
cron.schedule(
    "0 0 * * *",
    () => {
        resetDailyCounter();
    },
    {
        timezone: "UTC",
    },
);

// Cleanup uploaded shorts every 30 minutes.
cron.schedule(
    "*/30 * * * *",
    () => {
        callMainApp("/scheduler", "POST", {
            action: "cleanup_uploaded",
        });
    },
    {
        timezone: "UTC",
    },
);

// Health check every 5 minutes
cron.schedule("*/5 * * * *", () => {
    console.log("💚 Health check - Scheduler is running");
    console.log(
        `   Last run: ${lastRunTime ? lastRunTime.toISOString() : "Never"}`,
    );
    console.log(`   Currently running: ${isRunning}`);
});

// Manual trigger endpoint (simple HTTP server)
const server = Bun.serve({
    hostname: SCHEDULER_HOST,
    port: SCHEDULER_PORT,
    async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/health") {
            return Response.json({
                status: "healthy",
                isRunning,
                lastRunTime: lastRunTime?.toISOString() || null,
            });
        }

        if (url.pathname === "/trigger" && req.method === "POST") {
            if (isRunning) {
                return Response.json({
                    success: false,
                    message: "Scheduler is already running",
                });
            }

            // Run async
            checkAndRunUploads();

            return Response.json({
                success: true,
                message: "Scheduler triggered",
            });
        }

        if (url.pathname === "/status") {
            const configResult = await callMainApp("/config");
            const stateResult = await callMainApp("/scheduler");

            return Response.json({
                scheduler: {
                    isRunning,
                    lastRunTime: lastRunTime?.toISOString() || null,
                    cachedTriggerKeys: firedTriggerKeys.size,
                },
                config: configResult.config,
                state: stateResult.state,
            });
        }

        return Response.json({ error: "Not found" }, { status: 404 });
    },
});

console.log(
    `🌐 Scheduler HTTP server running on http://${SCHEDULER_HOST}:${SCHEDULER_PORT}`,
);
console.log("📋 Available endpoints:");
console.log("   GET  /health - Health check");
console.log("   POST /trigger - Manually trigger upload run");
console.log("   GET  /status - Get scheduler status");
