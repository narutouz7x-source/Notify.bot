import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, 
  Terminal, 
  Settings, 
  Instagram, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Activity, 
  Send, 
  Hash, 
  Sparkles, 
  BookOpen, 
  Copy, 
  Github,
  HelpCircle,
  ExternalLink,
  Info,
  Eye,
  EyeOff
} from "lucide-react";

interface BotConfig {
  DISCORD_TOKEN_CONFIGURED: boolean;
  DISCORD_TOKEN: string;
  TARGET_CHANNEL_ID: string;
  INSTAGRAM_USERNAME: string;
  API_URL: string;
  API_KEY: string;
  BOT_PREFIX: string;
}

interface BotStatus {
  isReady: boolean;
  botUser: {
    username: string;
    tag: string;
    avatar: string;
  } | null;
  botError: string | null;
  lastPost: {
    id: string;
    shortcode: string;
    caption: string;
    link: string;
    mediaUrl: string;
  } | null;
  logs: string[];
  config: BotConfig;
}

export default function App() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollingActive, setPollingActive] = useState(true);
  const [triggeringPoll, setTriggeringPoll] = useState(false);
  const [pollSuccessMessage, setPollSuccessMessage] = useState<string | null>(null);
  
  // Simulation states
  const [simulatedMessages, setSimulatedMessages] = useState<Array<{
    id: number;
    author: string;
    avatar: string;
    content?: string;
    isBot: boolean;
    embed?: {
      color: string;
      title: string;
      url?: string;
      description: string;
      fields?: Array<{ name: string; value: string; inline?: boolean }>;
      image?: string;
      footer?: string;
    };
  }>>([
    {
      id: 1,
      author: "System",
      avatar: "https://cdn-icons-png.flaticon.com/512/616/616430.png",
      content: "Welcome to the Discord Bot Playground! Type a command below or click a quick command to simulate a Discord interaction.",
      isBot: true,
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const discordChatEndRef = useRef<HTMLDivElement>(null);

  // Configuration Form States
  const [discordToken, setDiscordToken] = useState("");
  const [targetChannelId, setTargetChannelId] = useState("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [botPrefix, setBotPrefix] = useState("");
  const [configSuccessMessage, setConfigSuccessMessage] = useState<string | null>(null);
  const [configErrorMessage, setConfigErrorMessage] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [hasInitializedForm, setHasInitializedForm] = useState(false);

  // Auto initialize configuration form states once when bot status is fetched
  useEffect(() => {
    if (status?.config && !hasInitializedForm) {
      setDiscordToken(status.config.DISCORD_TOKEN || "");
      setTargetChannelId(status.config.TARGET_CHANNEL_ID || "");
      setInstagramUsername(status.config.INSTAGRAM_USERNAME || "");
      setApiUrl(status.config.API_URL || "");
      setApiKey(status.config.API_KEY || "");
      setBotPrefix(status.config.BOT_PREFIX || "");
      setHasInitializedForm(true);
    }
  }, [status, hasInitializedForm]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccessMessage(null);
    setConfigErrorMessage(null);
    try {
      const res = await fetch("/api/update-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          DISCORD_TOKEN: discordToken,
          TARGET_CHANNEL_ID: targetChannelId,
          INSTAGRAM_USERNAME: instagramUsername,
          API_URL: apiUrl,
          API_KEY: apiKey,
          BOT_PREFIX: botPrefix
        })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setConfigSuccessMessage("Configuration updated successfully!");
        fetchStatus();
      } else {
        throw new Error(data.error || "Failed to update configuration");
      }
    } catch (err: any) {
      setConfigErrorMessage(err.message || "An error occurred");
    } finally {
      setSavingConfig(false);
      setTimeout(() => {
        setConfigSuccessMessage(null);
        setConfigErrorMessage(null);
      }, 5000);
    }
  };

  // Fetch status of the bot
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/bot-status");
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setStatus(data);
        } else {
          console.warn("Received non-JSON response from /api/bot-status");
        }
      }
    } catch (err) {
      console.error("Error fetching bot status:", err);
    } finally {
      setLoading(false);
    }
  };

  // Poll status every 2.5 seconds
  useEffect(() => {
    fetchStatus();
    let interval: NodeJS.Timeout;
    if (pollingActive) {
      interval = setInterval(fetchStatus, 2500);
    }
    return () => clearInterval(interval);
  }, [pollingActive]);

  // Autoscroll terminal and simulator chat
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [status?.logs]);

  useEffect(() => {
    if (discordChatEndRef.current) {
      discordChatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [simulatedMessages]);

  const handleManualTrigger = async () => {
    setTriggeringPoll(true);
    setPollSuccessMessage(null);
    try {
      const res = await fetch("/api/trigger-poll", { method: "POST" });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (data.success) {
          setPollSuccessMessage("Instagram checked successfully! Check logs below.");
          fetchStatus();
        } else {
          setPollSuccessMessage("Check failed: " + data.error);
        }
      } else {
        throw new Error("Received non-JSON response from server");
      }
    } catch (err: any) {
      setPollSuccessMessage("Trigger error: " + err.message);
    } finally {
      setTriggeringPoll(false);
      setTimeout(() => setPollSuccessMessage(null), 5000);
    }
  };

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;

    const userMsgId = Date.now();
    const prefix = status?.config?.BOT_PREFIX || "!";
    const userMessage = {
      id: userMsgId,
      author: "GuildMember",
      avatar: "https://cdn-icons-png.flaticon.com/512/147/147144.png",
      content: text,
      isBot: false,
    };

    setSimulatedMessages(prev => [...prev, userMessage]);
    setChatInput("");

    // Simulate Bot Response logic
    setTimeout(() => {
      const cleaned = text.trim();
      const botAvatar = status?.botUser?.avatar || "https://cdn-icons-png.flaticon.com/512/4712/4712109.png";
      const botName = status?.botUser?.username || "InstagramBot";
      
      // 1. Mention responder check
      // Users tag the bot either via @bot, @mention, or "tag"
      if (cleaned.toLowerCase().includes("@bot") || cleaned.toLowerCase().includes("@instagrambot")) {
        setSimulatedMessages(prev => [...prev, {
          id: Date.now(),
          author: botName,
          avatar: botAvatar,
          content: `Hey <@GuildMember>, my prefix for this server is \`${prefix}\`. Use \`${prefix}help\` for more info.`,
          isBot: true,
        }]);
        return;
      }

      // 2. Command check
      if (cleaned.startsWith(prefix)) {
        const cmd = cleaned.slice(prefix.length).trim().split(/ +/)[0].toLowerCase();
        
        if (cmd === "help") {
          setSimulatedMessages(prev => [...prev, {
            id: Date.now(),
            author: botName,
            avatar: botAvatar,
            isBot: true,
            embed: {
              color: "#5865F2", // Discord Blurple
              title: "🤖 Instagram Tracker Bot Help",
              description: `Hello! I am a production-ready Discord Bot designed to track **@${status?.config?.INSTAGRAM_USERNAME || "cristiano"}** and announce new posts automatically.`,
              fields: [
                { name: "📋 Configuration", value: `• **Prefix:** \`${prefix}\`\n• **Target Channel:** <#${status?.config?.TARGET_CHANNEL_ID || "Not configured"}>\n• **Tracking Account:** [@${status?.config?.INSTAGRAM_USERNAME || "cristiano"}](https://instagram.com/${status?.config?.INSTAGRAM_USERNAME || "cristiano"})` },
                { name: "✨ Commands", value: `• \`${prefix}help\` - Displays this information menu.\n• \`${prefix}status\` - Check tracking and server parameters.` },
                { name: "🎯 Automatic Features", value: `• **Mention Reply:** Tag me anytime to see my prefix.\n• **Instagram Polling:** Automatically queries Instagram every 15 minutes and publishes embeds for new content.` }
              ],
              footer: `Created with discord.js v14`
            }
          }]);
        } else if (cmd === "status") {
          setSimulatedMessages(prev => [...prev, {
            id: Date.now(),
            author: botName,
            avatar: botAvatar,
            isBot: true,
            embed: {
              color: "#2ECC71", // Green
              title: "⚙️ System Status",
              description: "Current live parameters of the tracking agent.",
              fields: [
                { name: "📡 Bot Health", value: status?.isReady ? "🟢 Active & Online" : "🟡 Running in Simulator Mode", inline: true },
                { name: "⚡ Bot Latency", value: "`34ms`", inline: true },
                { name: "📸 Tracking Target", value: `[@${status?.config?.INSTAGRAM_USERNAME || "cristiano"}](https://instagram.com/${status?.config?.INSTAGRAM_USERNAME || "cristiano"})`, inline: true },
                { name: "🕒 Last Checked Post", value: status?.lastPost ? `[${status.lastPost.shortcode || "Post ID"}](${status.lastPost.link})` : "None recorded yet" }
              ]
            }
          }]);
        } else {
          setSimulatedMessages(prev => [...prev, {
            id: Date.now(),
            author: botName,
            avatar: botAvatar,
            content: `Unknown command. Use \`${prefix}help\` to see all available commands.`,
            isBot: true,
          }]);
        }
      }
    }, 800);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-[#0F1115] text-[#E4E6EB] font-sans antialiased selection:bg-[#5865F2]/30 selection:text-white pb-12">
      {/* Header Bar */}
      <header className="border-b border-[#202225] bg-[#18191C]/80 backdrop-blur sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#5865F2]/15 text-[#5865F2] rounded-xl">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Discord Instagram Tracker Bot
                <span className="text-xs bg-[#5865F2]/20 text-[#5865F2] px-2 py-0.5 rounded-full font-medium">
                  v14.26
                </span>
              </h1>
              <p className="text-xs text-[#96989D]">Monitor Instagram accounts and feed updates directly into Discord.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 self-end md:self-auto">
            <button 
              onClick={() => {
                setPollingActive(!pollingActive);
                if(!pollingActive) fetchStatus();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                pollingActive 
                  ? "bg-[#2F3136] text-[#E4E6EB] hover:bg-[#3C3F45]" 
                  : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
              }`}
            >
              <Activity className={`h-3.5 w-3.5 ${pollingActive ? "animate-pulse text-emerald-400" : ""}`} />
              {pollingActive ? "Auto Refreshing" : "Refresh Paused"}
            </button>
            <button 
              onClick={fetchStatus}
              className="p-1.5 bg-[#2F3136] hover:bg-[#3C3F45] text-[#96989D] hover:text-white rounded-lg transition"
              title="Refresh State Now"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: System Status & Configs */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* Status Panel */}
          <div className="bg-[#18191C] border border-[#202225] rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#5865F2]"></div>
            
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#96989D] mb-4 flex items-center justify-between">
              Live Connection
              {status?.isReady ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold lowercase bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active & Online
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold lowercase bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                  <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                  local simulator mode
                </span>
              )}
            </h2>

            {status?.isReady && status.botUser ? (
              <div className="flex items-center gap-4 bg-[#2F3136]/40 p-4 rounded-xl border border-[#2F3136]/60">
                <img 
                  src={status.botUser.avatar} 
                  alt="Bot Avatar" 
                  className="w-12 h-12 rounded-full border border-[#5865F2]/40"
                />
                <div>
                  <h3 className="font-bold text-white text-base">{status.botUser.username}</h3>
                  <p className="text-xs text-[#96989D] font-mono">{status.botUser.tag}</p>
                </div>
              </div>
            ) : (
              <div className="bg-[#2F3136]/30 p-4 rounded-xl border border-[#2F3136]/40 space-y-3">
                <div className="flex items-start gap-2.5 text-amber-400 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Discord Token is Not Configured</span>
                    To connect the bot to your live Discord server, you must provide your <code className="bg-[#202225] text-amber-300 px-1 rounded">DISCORD_TOKEN</code>.
                  </div>
                </div>
                <div className="text-xs text-[#96989D] leading-relaxed">
                  The bot is running in offline <strong>Playground Mode</strong>. Use the interactive <strong>Discord Chat Simulator</strong> on the right to trigger and test bot commands in real-time!
                </div>
              </div>
            )}

            {status?.botError && (
              <div className="mt-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <div>
                  <strong className="block font-semibold">Bot Login Failed</strong>
                  {status.botError}
                </div>
              </div>
            )}
          </div>

          {/* Bot Settings & Configuration Panel */}
          <div className="bg-[#18191C] border border-[#202225] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-[#5865F2]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Bot Settings & Parameters
              </h3>
            </div>
            <p className="text-xs text-[#96989D] leading-relaxed">
              Dynamically modify the Instagram target, API endpoints, tokens, and prefixes. All changes apply immediately without server restarts.
            </p>

            <form onSubmit={handleSaveConfig} className="space-y-4 pt-2">
              {/* Instagram Username */}
              <div>
                <label className="block text-xs font-semibold text-[#96989D] mb-1.5 uppercase tracking-wide">
                  Instagram Target Account
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#96989D]">
                    <Instagram className="h-4 w-4 text-[#E1306C]" />
                  </div>
                  <input
                    type="text"
                    value={instagramUsername}
                    onChange={(e) => setInstagramUsername(e.target.value)}
                    placeholder="e.g. cristiano"
                    className="w-full bg-[#202225] text-white border border-[#2F3136] rounded-xl pl-9 pr-4 py-2.5 text-xs font-medium focus:outline-none focus:border-[#5865F2] transition"
                  />
                </div>
              </div>

              {/* Grid for Prefix & Channel ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Prefix */}
                <div>
                  <label className="block text-xs font-semibold text-[#96989D] mb-1.5 uppercase tracking-wide">
                    Bot Prefix
                  </label>
                  <input
                    type="text"
                    value={botPrefix}
                    onChange={(e) => setBotPrefix(e.target.value)}
                    placeholder="!"
                    maxLength={5}
                    className="w-full bg-[#202225] text-white border border-[#2F3136] rounded-xl px-3 py-2.5 text-xs font-mono font-bold focus:outline-none focus:border-[#5865F2] transition text-center"
                  />
                </div>

                {/* Target Channel ID */}
                <div>
                  <label className="block text-xs font-semibold text-[#96989D] mb-1.5 uppercase tracking-wide">
                    Discord Channel ID
                  </label>
                  <input
                    type="text"
                    value={targetChannelId}
                    onChange={(e) => setTargetChannelId(e.target.value)}
                    placeholder="e.g. 1498958315739283518"
                    className="w-full bg-[#202225] text-white border border-[#2F3136] rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-[#5865F2] transition"
                  />
                </div>
              </div>

              {/* Discord Bot Token */}
              <div>
                <label className="block text-xs font-semibold text-[#96989D] mb-1.5 uppercase tracking-wide">
                  Discord Bot Token
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={discordToken}
                    onChange={(e) => setDiscordToken(e.target.value)}
                    placeholder="Paste DISCORD_TOKEN here"
                    className="w-full bg-[#202225] text-white border border-[#2F3136] rounded-xl pl-3 pr-10 py-2.5 text-xs font-mono focus:outline-none focus:border-[#5865F2] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#96989D] hover:text-white transition"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Proxy API URL */}
              <div>
                <label className="block text-xs font-semibold text-[#96989D] mb-1.5 uppercase tracking-wide">
                  Proxy API Endpoint (URL)
                </label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.apify.com/... or RapidAPI URL"
                  className="w-full bg-[#202225] text-white border border-[#2F3136] rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-[#5865F2] transition"
                />
              </div>

              {/* Proxy API Key */}
              <div>
                <label className="block text-xs font-semibold text-[#96989D] mb-1.5 uppercase tracking-wide">
                  Proxy API Key / Token
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter API_KEY here (Optional/RapidAPI)"
                    className="w-full bg-[#202225] text-white border border-[#2F3136] rounded-xl pl-3 pr-10 py-2.5 text-xs font-mono focus:outline-none focus:border-[#5865F2] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#96989D] hover:text-white transition"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Status notifications */}
              {configSuccessMessage && (
                <div className="p-3 bg-[#2ECC71]/10 border border-[#2ECC71]/20 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{configSuccessMessage}</span>
                </div>
              )}

              {configErrorMessage && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{configErrorMessage}</span>
                </div>
              )}

              {/* Save Button */}
              <button
                type="submit"
                disabled={savingConfig}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] disabled:bg-[#5865F2]/50 text-white font-semibold text-xs rounded-xl shadow-lg transition active:translate-y-[1px]"
              >
                {savingConfig ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Save & Apply Configurations
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Checked Instagram Post Display */}
          <div className="bg-[#18191C] border border-[#202225] rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#96989D] flex items-center gap-2">
                <Instagram className="h-4 w-4 text-[#E1306C]" />
                Tracked Account
              </h3>
              <button
                onClick={handleManualTrigger}
                disabled={triggeringPoll}
                className="flex items-center gap-1 text-xs text-[#5865F2] hover:text-[#7289DA] font-semibold transition disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${triggeringPoll ? "animate-spin" : ""}`} />
                Check Now
              </button>
            </div>

            {pollSuccessMessage && (
              <div className="mb-4 p-2 bg-[#2ECC71]/10 border border-[#2ECC71]/20 rounded-lg text-center text-xs text-emerald-400">
                {pollSuccessMessage}
              </div>
            )}

            {status?.lastPost ? (
              <div className="bg-[#2F3136]/30 rounded-xl overflow-hidden border border-[#2F3136]/40">
                {status.lastPost.mediaUrl && (
                  <div className="h-48 overflow-hidden relative group">
                    <img 
                      src={status.lastPost.mediaUrl} 
                      alt="Instagram Cover" 
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-3 right-3 bg-black/60 text-white text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">
                      Latest Feed Post
                    </div>
                  </div>
                )}
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">@{status.config.INSTAGRAM_USERNAME}</span>
                    <a 
                      href={status.lastPost.link} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-xs text-[#5865F2] hover:underline flex items-center gap-0.5"
                    >
                      View on Instagram
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <p className="text-xs text-[#96989D] line-clamp-3 leading-relaxed">
                    {status.lastPost.caption}
                  </p>
                  <div className="pt-2 text-[10px] text-[#72767D] font-mono flex justify-between">
                    <span>ID: {status.lastPost.id.substring(0, 18)}...</span>
                    <span>Code: {status.lastPost.shortcode}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#2F3136]/20 py-8 px-4 rounded-xl border border-dashed border-[#2F3136] text-center space-y-2">
                <p className="text-xs text-[#96989D]">No Instagram posts tracked yet.</p>
                <p className="text-[11px] text-[#72767D]">
                  Click "Check Now" above to trigger a test check from the proxy API!
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Console Log & Discord Interactive Simulator */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Discord Bot Interactive Chat Simulator */}
          <div className="bg-[#36393F] rounded-2xl shadow-2xl border border-[#2F3136] overflow-hidden flex flex-col h-[520px]">
            {/* Header */}
            <div className="bg-[#2F3136] px-4 py-3 border-b border-[#202225] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hash className="h-5 w-5 text-[#8E9297]" />
                <div>
                  <h3 className="text-sm font-bold text-white"># bot-playground</h3>
                  <p className="text-xs text-[#B9BBBE]">Interact with your bot commands directly inside the web browser!</p>
                </div>
              </div>
              <div className="text-xs bg-[#202225] text-[#8E9297] px-2 py-0.5 rounded font-mono font-semibold">
                SIMULATOR
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {simulatedMessages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-4 hover:bg-[#32353B]/40 p-1 -mx-1 rounded transition group">
                  <img 
                    src={msg.avatar} 
                    alt="avatar" 
                    className="w-10 h-10 rounded-full bg-[#202225] shrink-0 object-cover"
                  />
                  <div className="space-y-1 overflow-hidden flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm hover:underline cursor-pointer">{msg.author}</span>
                      {msg.isBot && (
                        <span className="bg-[#5865F2] text-white font-bold text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider">
                          BOT
                        </span>
                      )}
                      <span className="text-[10px] text-[#72767D]">Today at {new Date(msg.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    
                    {msg.content && (
                      <p className="text-sm text-[#DCDDDE] leading-relaxed whitespace-pre-wrap font-sans">
                        {msg.content}
                      </p>
                    )}

                    {/* Discord Embed Renderer */}
                    {msg.embed && (
                      <div 
                        className="border-l-4 rounded-r-md bg-[#2F3136] p-4 max-w-lg mt-2 shadow-md space-y-3"
                        style={{ borderColor: msg.embed.color }}
                      >
                        {msg.embed.title && (
                          <h4 className="text-sm font-bold text-white hover:underline cursor-pointer">
                            {msg.embed.url ? (
                              <a href={msg.embed.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-400">
                                {msg.embed.title}
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : msg.embed.title}
                          </h4>
                        )}
                        {msg.embed.description && (
                          <p className="text-xs text-[#DCDDDE] whitespace-pre-wrap leading-relaxed">
                            {msg.embed.description}
                          </p>
                        )}
                        {msg.embed.fields && msg.embed.fields.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                            {msg.embed.fields.map((f, idx) => (
                              <div key={idx} className={f.inline ? "" : "col-span-full"}>
                                <div className="text-xs font-semibold text-white">{f.name}</div>
                                <div className="text-xs text-[#B9BBBE] whitespace-pre-wrap leading-relaxed mt-0.5">{f.value}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.embed.image && (
                          <div className="max-h-48 overflow-hidden rounded-md mt-2 border border-[#202225]">
                            <img src={msg.embed.image} alt="Embed Media" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        )}
                        {msg.embed.footer && (
                          <div className="text-[10px] text-[#72767D] font-medium pt-1 border-t border-[#383A40]/40">
                            {msg.embed.footer}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={discordChatEndRef} />
            </div>

            {/* Quick Command Suggestions */}
            <div className="bg-[#2F3136]/50 px-4 py-2 border-t border-[#202225]/40 flex flex-wrap gap-2 items-center">
              <span className="text-[11px] text-[#72767D] font-bold uppercase mr-1">Quick Commands:</span>
              <button 
                onClick={() => handleSendMessage(`${status?.config?.BOT_PREFIX || "!"}help`)}
                className="bg-[#36393F] hover:bg-[#40444B] text-xs text-white px-2.5 py-1 rounded font-medium border border-[#202225]/30 transition"
              >
                {status?.config?.BOT_PREFIX || "!"}help
              </button>
              <button 
                onClick={() => handleSendMessage(`${status?.config?.BOT_PREFIX || "!"}status`)}
                className="bg-[#36393F] hover:bg-[#40444B] text-xs text-white px-2.5 py-1 rounded font-medium border border-[#202225]/30 transition"
              >
                {status?.config?.BOT_PREFIX || "!"}status
              </button>
              <button 
                onClick={() => handleSendMessage(`Hey @instagrambot!`)}
                className="bg-[#36393F] hover:bg-[#40444B] text-xs text-white px-2.5 py-1 rounded font-medium border border-[#202225]/30 transition"
              >
                Mention Bot
              </button>
            </div>

            {/* Input Form */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(chatInput);
              }}
              className="bg-[#36393F] p-4 pt-1"
            >
              <div className="relative">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Message #bot-playground (Try running ${status?.config?.BOT_PREFIX || "!"}help)`}
                  className="w-full bg-[#40444B] text-[#DCDDDE] placeholder-[#72767D] text-sm rounded-lg pl-4 pr-12 py-3 focus:outline-none border-none"
                />
                <button 
                  type="submit"
                  className="absolute right-3 top-2.5 p-1 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded transition"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>

          {/* Console / Bot Live Log Terminal */}
          <div className="bg-[#18191C] border border-[#202225] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#96989D] flex items-center gap-2">
                <Terminal className="h-4 w-4 text-[#5865F2]" />
                Live Bot Console Log
              </h3>
              <div className="flex items-center gap-2 text-xs text-[#72767D]">
                <span className="h-2 w-2 bg-emerald-400 rounded-full animate-pulse"></span>
                Streaming output
              </div>
            </div>

            <div className="bg-[#0F1115] rounded-xl border border-[#202225] p-4 h-64 overflow-y-auto font-mono text-xs leading-relaxed text-[#39E75D] shadow-inner">
              {status?.logs && status.logs.length > 0 ? (
                <div className="space-y-1.5">
                  {status.logs.map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap select-text break-all">
                      {log.startsWith("[Bot") ? (
                        <span>
                          <span className="text-[#5865F2] font-semibold">{log.substring(0, log.indexOf("]") + 1)}</span>
                          <span className="text-white">{log.substring(log.indexOf("]") + 1)}</span>
                        </span>
                      ) : (
                        <span>{log}</span>
                      )}
                    </div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-[#72767D] font-sans">
                  Waiting for bot logs...
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#72767D]">
              <span>Logs are updated automatically via SSE/API polling.</span>
              <button 
                onClick={() => {
                  if (status?.logs) {
                    copyToClipboard(status.logs.join("\n"));
                  }
                }}
                className="flex items-center gap-1 text-[#96989D] hover:text-white transition font-semibold"
              >
                <Copy className="h-3 w-3" />
                Copy Logs
              </button>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
