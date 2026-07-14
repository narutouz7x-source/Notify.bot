import { Client, GatewayIntentBits, ActivityType, EmbedBuilder, REST, Routes, SlashCommandBuilder } from 'discord.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Ensure env variables are loaded
dotenv.config();

// In-memory logger for the dashboard UI
export const botLogs = [];
export function botLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[Bot ${timestamp}] ${message}`;
  botLogs.push(entry);
  if (botLogs.length > 200) botLogs.shift();
  console.log(entry);
}

// Bot state
export let lastCheckedPost = null;
export let isBotReady = false;
export let botUser = null;
export let botError = null;

// File path for saving the last checked Instagram post ID
const LAST_POST_FILE = path.join(process.cwd(), 'last_post_id.txt');

// Configs
export let DISCORD_TOKEN = process.env.DISCORD_TOKEN || '';
export let TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || '';
export let INSTAGRAM_USERNAME = process.env.INSTAGRAM_USERNAME || 'cristiano';
export let API_URL = process.env.API_URL || 'https://instagram-bulk-profile-scraps.p.rapidapi.com/v1.2/posts';
export let API_KEY = process.env.API_KEY || '';
export let BOT_PREFIX = process.env.BOT_PREFIX || '!';

const CONFIG_FILE = path.join(process.cwd(), 'bot_config.json');

// Helper to load dynamic config if it exists
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (data.DISCORD_TOKEN !== undefined) DISCORD_TOKEN = data.DISCORD_TOKEN;
      if (data.TARGET_CHANNEL_ID !== undefined) TARGET_CHANNEL_ID = data.TARGET_CHANNEL_ID;
      if (data.INSTAGRAM_USERNAME !== undefined) INSTAGRAM_USERNAME = data.INSTAGRAM_USERNAME;
      if (data.API_URL !== undefined) API_URL = data.API_URL;
      if (data.API_KEY !== undefined) API_KEY = data.API_KEY;
      if (data.BOT_PREFIX !== undefined) BOT_PREFIX = data.BOT_PREFIX;
      botLog('Loaded saved configurations from bot_config.json');
    } catch (err) {
      botLog(`Failed to load bot_config.json: ${err.message}`);
    }
  }
}

loadConfig();

export function updateBotConfig(newConfig) {
  if (newConfig.DISCORD_TOKEN !== undefined) DISCORD_TOKEN = newConfig.DISCORD_TOKEN;
  if (newConfig.TARGET_CHANNEL_ID !== undefined) TARGET_CHANNEL_ID = newConfig.TARGET_CHANNEL_ID;
  if (newConfig.INSTAGRAM_USERNAME !== undefined) INSTAGRAM_USERNAME = newConfig.INSTAGRAM_USERNAME;
  if (newConfig.API_URL !== undefined) API_URL = newConfig.API_URL;
  if (newConfig.API_KEY !== undefined) API_KEY = newConfig.API_KEY;
  if (newConfig.BOT_PREFIX !== undefined) BOT_PREFIX = newConfig.BOT_PREFIX;

  // Save to file
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({
      DISCORD_TOKEN,
      TARGET_CHANNEL_ID,
      INSTAGRAM_USERNAME,
      API_URL,
      API_KEY,
      BOT_PREFIX
    }, null, 2), 'utf8');
    botLog('Successfully saved updated configuration to bot_config.json');
  } catch (err) {
    botLog(`Failed to write bot_config.json: ${err.message}`);
  }

  // If client is logged in, update presence with new Instagram username
  if (client && isBotReady) {
    try {
      const presenceString = `Watching @${INSTAGRAM_USERNAME}`;
      client.user.setActivity(presenceString, { type: ActivityType.Watching });
      botLog(`Presence updated to: "Watching @${INSTAGRAM_USERNAME}"`);
    } catch (err) {
      botLog(`Failed to dynamically update presence status: ${err.message}`);
    }
  }
}

export function getBotConfig() {
  return {
    DISCORD_TOKEN,
    TARGET_CHANNEL_ID,
    INSTAGRAM_USERNAME,
    API_URL,
    API_KEY,
    BOT_PREFIX
  };
}

botLog(`Initializing Discord Bot. Prefix: "${BOT_PREFIX}", Monitoring Instagram: @${INSTAGRAM_USERNAME}`);

// Global Discord Client variable
export let client = null;
let isPollingStarted = false;

// Initialize the Last Post file if it doesn't exist
if (!fs.existsSync(LAST_POST_FILE)) {
  try {
    fs.writeFileSync(LAST_POST_FILE, '', 'utf8');
    botLog('Created local post tracker file (last_post_id.txt)');
  } catch (err) {
    botLog(`Failed to create post tracker file: ${err.message}`);
  }
}

// Get the saved post ID
function getSavedPostId() {
  try {
    if (fs.existsSync(LAST_POST_FILE)) {
      return fs.readFileSync(LAST_POST_FILE, 'utf8').trim();
    }
  } catch (err) {
    botLog(`Error reading saved post ID: ${err.message}`);
  }
  return '';
}

// Save the post ID
function savePostId(id) {
  try {
    fs.writeFileSync(LAST_POST_FILE, id, 'utf8');
    botLog(`Saved new post ID to local file: ${id}`);
  } catch (err) {
    botLog(`Error saving post ID: ${err.message}`);
  }
}

// Helper to extract post data robustly from any API response format
export function parseInstagramResponse(data) {
  if (!data) return null;

  // 1. Direct array of posts
  if (Array.isArray(data) && data.length > 0) {
    return parseSinglePost(data[0]);
  }

  // 2. Wrap inside a data/items property
  if (data.data) {
    if (Array.isArray(data.data) && data.data.length > 0) {
      return parseSinglePost(data.data[0]);
    }
    if (data.data.items && Array.isArray(data.data.items) && data.data.items.length > 0) {
      return parseSinglePost(data.data.items[0]);
    }
    // Deep GraphQL-like structures
    try {
      const edges = data.data.user?.edge_owner_to_timeline_media?.edges;
      if (edges && edges.length > 0) {
        const node = edges[0].node;
        return {
          id: node.id || node.shortcode,
          shortcode: node.shortcode,
          link: `https://www.instagram.com/p/${node.shortcode}/`,
          caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || 'New post!',
          mediaUrl: node.display_url || node.thumbnail_src || ''
        };
      }
    } catch (_) {}
  }

  // 3. Simple single post object
  if (data.id || data.shortcode || data.code) {
    return parseSinglePost(data);
  }

  return null;
}

function parseSinglePost(post) {
  const shortcode = post.shortcode || post.code || post.id || '';
  const id = post.id || shortcode;
  const caption = post.caption || post.text || post.title || 'New Instagram Post!';
  const link = post.link || post.url || (shortcode ? `https://www.instagram.com/p/${shortcode}/` : `https://www.instagram.com/@${INSTAGRAM_USERNAME}`);
  const mediaUrl = post.display_url || post.image || post.media_url || post.thumbnail || post.thumbnail_url || '';

  return { id, shortcode, caption, link, mediaUrl };
}

// The core Instagram Polling / Check Function
export async function checkInstagramPosts() {
  botLog(`Initiating Instagram check for @${INSTAGRAM_USERNAME}...`);
  try {
    let post = null;

    // Determine headers
    const headers = {};
    if (API_KEY) {
      // Common rapidapi headers or generic authorization
      if (API_URL.includes('rapidapi.com')) {
        headers['X-RapidAPI-Key'] = API_KEY;
        try {
          const urlObj = new URL(API_URL);
          headers['X-RapidAPI-Host'] = urlObj.hostname;
        } catch (_) {
          headers['X-RapidAPI-Host'] = 'instagram-bulk-profile-scraps.p.rapidapi.com';
        }
      } else {
        headers['Authorization'] = `Bearer ${API_KEY}`;
      }
    }

    // Call the API
    botLog(`Fetching from API: ${API_URL}`);
    const response = await axios.get(API_URL, {
      params: { username: INSTAGRAM_USERNAME },
      headers,
      timeout: 10000 // 10 seconds timeout
    });

    post = parseInstagramResponse(response.data);

    if (!post) {
      botLog('Could not extract any posts from API response. Check if structure matches or API is valid.');
      return null;
    }

    botLog(`Latest post fetched: ID: ${post.id}, Shortcode: ${post.shortcode}`);
    lastCheckedPost = post;

    const savedId = getSavedPostId();
    botLog(`Stored Post ID is: "${savedId}"`);

    // If it's a brand new post
    if (post.id && post.id !== savedId) {
      botLog(`New post detected! Storing ID and sending Discord notification.`);
      savePostId(post.id);

      // Send to Discord if bot is ready
      if (isBotReady && TARGET_CHANNEL_ID && client) {
        const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(err => {
          botLog(`Failed to fetch target channel ${TARGET_CHANNEL_ID}: ${err.message}`);
          return null;
        });

        if (channel && channel.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor('#E1306C') // Instagram pinkish red
            .setTitle(`📸 New Post by @${INSTAGRAM_USERNAME}`)
            .setURL(post.link)
            .setDescription(post.caption.length > 200 ? `${post.caption.substring(0, 197)}...` : post.caption)
            .setImage(post.mediaUrl || null)
            .setTimestamp()
            .setFooter({ text: 'Instagram Tracker', iconURL: 'https://cdn-icons-png.flaticon.com/512/174/174855.png' });

          await channel.send({
            content: `📢 **Hey everyone! @${INSTAGRAM_USERNAME} just posted on Instagram!**`,
            embeds: [embed]
          });
          botLog(`Successfully sent Instagram notification embed to channel ${TARGET_CHANNEL_ID}`);
        } else {
          botLog(`Target channel ${TARGET_CHANNEL_ID} is not a valid text channel or is unreachable.`);
        }
      } else {
        if (!isBotReady) {
          botLog('Bot is not logged into Discord; skipped sending message but recorded ID.');
        }
        if (!TARGET_CHANNEL_ID) {
          botLog('TARGET_CHANNEL_ID is not configured in .env; skipped sending Discord message.');
        }
      }
    } else {
      botLog('No new posts detected (matches stored ID).');
    }

    return post;
  } catch (error) {
    botLog(`Error checking Instagram posts: ${error.message}`);
    if (error.response) {
      botLog(`API response status: ${error.response.status}`);
    }
    return null;
  }
}

// Function to register slash commands globally
async function registerSlashCommands(clientId) {
  botLog(`Registering application (/) commands with Discord REST API for Client ID: ${clientId}...`);
  
  const commands = [
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Displays information about the bot and a list of available commands.'),
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Check live parameters and status of the tracking agent.')
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    botLog('Successfully registered application (/) commands globally!');
  } catch (err) {
    botLog(`⚠️ Error registering slash commands: ${err.message}`);
  }
}

// Function to initialize the Discord client with specified intents
function initDiscordClient(usePrivileged = true) {
  botLog(`Creating Discord Client instance (usePrivilegedIntents=${usePrivileged})...`);
  
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ];
  
  if (usePrivileged) {
    intents.push(GatewayIntentBits.MessageContent);
  }

  client = new Client({ intents });

  // Global Discord error listener to prevent unhandled error event crashes
  client.on('error', (err) => {
    botLog(`⚠️ Discord Client Error: ${err.message}`);
  });

  // Bot Ready event handler
  client.once('ready', () => {
    isBotReady = true;
    botUser = {
      username: client.user.username,
      tag: client.user.tag,
      avatar: client.user.displayAvatarURL()
    };
    botError = null;
    botLog(`SUCCESS! Logged into Discord as ${client.user.tag}`);

    // Set customizable presence status (e.g. Watching @username)
    const presenceString = `Watching @${INSTAGRAM_USERNAME}`;
    client.user.setActivity(presenceString, { type: ActivityType.Watching });
    botLog(`Presence set to: "Watching @${INSTAGRAM_USERNAME}"`);

    // Dynamic Client ID detection for slash command registration
    const detectedClientId = process.env.CLIENT_ID || client.user.id;
    if (detectedClientId) {
      registerSlashCommands(detectedClientId);
    } else {
      botLog('⚠️ Warning: Could not determine Client ID for slash commands registration.');
    }

    // Start the 15-minute polling loop if not already running
    if (!isPollingStarted) {
      isPollingStarted = true;
      checkInstagramPosts();
      setInterval(() => {
        checkInstagramPosts();
      }, 15 * 60 * 1000); // 15 minutes
    }
  });

  // Bot Message Create event handler (for mentions & legacy prefix commands)
  client.on('messageCreate', async (message) => {
    // Prevent bot responding to itself or other bots
    if (message.author.bot) return;

    // 1. Mention Responder
    if (client.user && message.mentions.has(client.user) && !message.reference) {
      botLog(`Bot mentioned by ${message.author.username} in #${message.channel?.name || 'unknown'}`);
      try {
        await message.reply({
          content: `Hey <@${message.author.id}>, my prefix for this server is \`${BOT_PREFIX}\`. Use \`${BOT_PREFIX}help\` for more info.`
        });
      } catch (err) {
        botLog(`Failed to send mention reply: ${err.message}`);
      }
      return;
    }

    // 2. Command parser
    if (!message.content.startsWith(BOT_PREFIX)) return;

    const args = message.content.slice(BOT_PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Help command
    if (command === 'help') {
      botLog(`User ${message.author.username} ran help command in #${message.channel?.name || 'unknown'}`);
      try {
        const helpEmbed = new EmbedBuilder()
          .setColor('#5865F2') // Discord blurple
          .setTitle('🤖 Instagram Tracker Bot Help')
          .setDescription(`Hello! I am a production-ready Discord Bot designed to track **@${INSTAGRAM_USERNAME}** and announce new posts automatically.`)
          .addFields(
            { name: '📋 Configuration', value: `• **Prefix:** \`${BOT_PREFIX}\`\n• **Target Channel:** <#${TARGET_CHANNEL_ID || 'Not set'}>\n• **Tracking Account:** [@${INSTAGRAM_USERNAME}](https://instagram.com/${INSTAGRAM_USERNAME})` },
            { name: '✨ Commands', value: `• \`/help\` or \`${BOT_PREFIX}help\` - Displays this information menu.\n• \`/status\` or \`${BOT_PREFIX}status\` - Check tracking and server parameters.` },
            { name: '🎯 Automatic Features', value: `• **Mention Reply:** Tag me anytime to see my prefix.\n• **Instagram Polling:** Automatically queries Instagram every 15 minutes and publishes embeds for new content.` }
          )
          .setFooter({ text: 'Created with discord.js v14', iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        await message.reply({ embeds: [helpEmbed] });
      } catch (err) {
        botLog(`Failed to send help command reply: ${err.message}`);
      }
    }

    // Status command
    if (command === 'status') {
      botLog(`User ${message.author.username} ran status command in #${message.channel?.name || 'unknown'}`);
      try {
        const statusEmbed = new EmbedBuilder()
          .setColor('#2ECC71') // Green
          .setTitle('⚙️ System Status')
          .setDescription('Current live parameters of the tracking agent.')
          .addFields(
            { name: '📡 Bot Health', value: '🟢 Active & Online', inline: true },
            { name: '⚡ Bot Latency', value: `\`${client.ws.ping}ms\``, inline: true },
            { name: '📸 Tracking Target', value: `[@${INSTAGRAM_USERNAME}](https://instagram.com/${INSTAGRAM_USERNAME})`, inline: true },
            { name: '🕒 Last Fetched Post', value: lastCheckedPost ? `[${lastCheckedPost.shortcode || lastCheckedPost.id}](${lastCheckedPost.link})` : 'None yet' }
          )
          .setTimestamp();

        await message.reply({ embeds: [statusEmbed] });
      } catch (err) {
        botLog(`Failed to send status reply: ${err.message}`);
      }
    }
  });

  // Bot Interaction Create event handler (for slash commands)
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'help') {
      botLog(`User ${interaction.user.username} executed /help slash command`);
      try {
        const helpEmbed = new EmbedBuilder()
          .setColor('#5865F2') // Discord blurple
          .setTitle('🤖 Instagram Tracker Bot Help')
          .setDescription(`Hello! I am a production-ready Discord Bot designed to track **@${INSTAGRAM_USERNAME}** and announce new posts automatically.`)
          .addFields(
            { name: '📋 Configuration', value: `• **Prefix:** \`${BOT_PREFIX}\`\n• **Target Channel:** <#${TARGET_CHANNEL_ID || 'Not set'}>\n• **Tracking Account:** [@${INSTAGRAM_USERNAME}](https://instagram.com/${INSTAGRAM_USERNAME})` },
            { name: '✨ Commands', value: `• \`/help\` or \`${BOT_PREFIX}help\` - Displays this information menu.\n• \`/status\` or \`${BOT_PREFIX}status\` - Check tracking and server parameters.` },
            { name: '🎯 Automatic Features', value: `• **Mention Reply:** Tag me anytime to see my prefix.\n• **Instagram Polling:** Automatically queries Instagram every 15 minutes and publishes embeds for new content.` }
          )
          .setFooter({ text: 'Created with discord.js v14', iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        await interaction.reply({ embeds: [helpEmbed] });
      } catch (err) {
        botLog(`Failed to respond to /help interaction: ${err.message}`);
      }
    }

    if (commandName === 'status') {
      botLog(`User ${interaction.user.username} executed /status slash command`);
      try {
        const statusEmbed = new EmbedBuilder()
          .setColor('#2ECC71') // Green
          .setTitle('⚙️ System Status')
          .setDescription('Current live parameters of the tracking agent.')
          .addFields(
            { name: '📡 Bot Health', value: '🟢 Active & Online', inline: true },
            { name: '⚡ Bot Latency', value: `\`${client.ws.ping}ms\``, inline: true },
            { name: '📸 Tracking Target', value: `[@${INSTAGRAM_USERNAME}](https://instagram.com/${INSTAGRAM_USERNAME})`, inline: true },
            { name: '🕒 Last Fetched Post', value: lastCheckedPost ? `[${lastCheckedPost.shortcode || lastCheckedPost.id}](${lastCheckedPost.link})` : 'None yet' }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [statusEmbed] });
      } catch (err) {
        botLog(`Failed to respond to /status interaction: ${err.message}`);
      }
    }
  });
}

// Start the bot with automatic self-healing fallback for DisallowedIntents
export function startBot() {
  if (!DISCORD_TOKEN || DISCORD_TOKEN === "YOUR_DISCORD_BOT_TOKEN_HERE" || DISCORD_TOKEN === "MY_DISCORD_TOKEN") {
    botLog('⚠️ Warning: DISCORD_TOKEN is missing or not configured. Running in mock/simulation mode. Web dashboard will display mock alerts!');
    botError = 'DISCORD_TOKEN is missing. Provide a valid token in the Settings or .env file to log in to Discord.';
    return false;
  }

  // Set up with MessageContent intent first
  initDiscordClient(true);

  botLog('Logging into Discord (with MessageContent intent)...');
  client.login(DISCORD_TOKEN).catch(error => {
    botLog(`Login attempt failed: ${error.message}`);
    
    // Check for Disallowed Intents error
    if (error.message.includes('disallowed') || error.message.includes('intent') || error.code === 'DisallowedIntents' || error.message.includes('DisallowedIntents')) {
      botLog('⚠️ DISALLOWED INTENTS DETECTED! Retrying login automatically without the privileged MessageContent intent...');
      
      // Fallback: Re-initialize client without MessageContent
      try {
        initDiscordClient(false);
        client.login(DISCORD_TOKEN).catch(fallbackError => {
          botError = fallbackError.message;
          botLog(`❌ FALLBACK LOGIN FAILED: ${fallbackError.message}`);
        });
      } catch (fallbackInitErr) {
        botError = fallbackInitErr.message;
        botLog(`❌ Failed to create fallback client: ${fallbackInitErr.message}`);
      }
    } else {
      botError = error.message;
      botLog(`❌ FAILED TO LOG IN TO DISCORD: ${error.message}`);
    }
  });

  return true;
}
