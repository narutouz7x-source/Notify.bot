import { Client, GatewayIntentBits, ActivityType, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
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

// File paths
const LAST_POST_FILE = path.join(process.cwd(), 'last_post_id.txt');
const LAST_POSTS_FILE = path.join(process.cwd(), 'last_posts.json');
const CONFIG_FILE = path.join(process.cwd(), 'bot_config.json');
const CONFIG_PATH = path.join(process.cwd(), 'config.json');

// Configs
export let DISCORD_TOKEN = process.env.DISCORD_TOKEN || '';
export let TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || '';
export let INSTAGRAM_USERNAME = process.env.INSTAGRAM_USERNAME || 'cristiano';
export let API_URL = process.env.API_URL || 'https://instagram-bulk-profile-scraps.p.rapidapi.com/v1.2/posts';
export let API_KEY = process.env.API_KEY || '';
export let BOT_PREFIX = process.env.BOT_PREFIX || '!';

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

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (Array.isArray(data)) {
        if (data.length > 0) {
          INSTAGRAM_USERNAME = data[0].instagramUsername || data[0].username || '';
          TARGET_CHANNEL_ID = data[0].channelId || data[0].channel || '';
        }
        botLog(`Loaded list of ${data.length} tracking targets from config.json`);
      } else {
        // Migrate old structure to array
        const username = data.username || data.instagramUsername || 'cristiano';
        const channel = data.channel || data.channelId || '';
        const migrated = [{ instagramUsername: username, channelId: channel }];
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(migrated, null, 2), 'utf8');
        INSTAGRAM_USERNAME = username;
        TARGET_CHANNEL_ID = channel;
        botLog('Migrated legacy config.json single object format to Array');
      }
    } catch (err) {
      botLog(`Failed to load config.json: ${err.message}`);
    }
  } else {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify([], null, 2), 'utf8');
      botLog('Initialized default empty array in config.json');
    } catch (err) {
      botLog(`Failed to write empty config.json: ${err.message}`);
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

  // Also keep config.json in sync if updated from dashboard
  try {
    let targets = [];
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        const fileContent = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (Array.isArray(parsed)) {
          targets = parsed;
        } else if (parsed && typeof parsed === 'object') {
          const username = parsed.username || parsed.instagramUsername;
          const channel = parsed.channel || parsed.channelId;
          if (username) {
            targets.push({ instagramUsername: username, channelId: channel || '' });
          }
        }
      } catch (_) {}
    }

    if (INSTAGRAM_USERNAME) {
      const existingIndex = targets.findIndex(t => t.instagramUsername.toLowerCase() === INSTAGRAM_USERNAME.toLowerCase());
      if (existingIndex > -1) {
        targets[existingIndex].channelId = TARGET_CHANNEL_ID;
      } else {
        targets.push({ instagramUsername: INSTAGRAM_USERNAME, channelId: TARGET_CHANNEL_ID });
      }
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(targets, null, 2), 'utf8');
    botLog('Successfully synchronized config.json with updated dashboard target settings');
  } catch (err) {
    botLog(`Failed to sync config.json: ${err.message}`);
  }

  // If client is logged in, update presence with new Instagram username
  if (client && isBotReady) {
    try {
      const presenceString = `Watching @${INSTAGRAM_USERNAME || 'multiple accounts'}`;
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

// Initialize the Last Posts json cache if it doesn't exist
if (!fs.existsSync(LAST_POSTS_FILE)) {
  try {
    fs.writeFileSync(LAST_POSTS_FILE, JSON.stringify({}), 'utf8');
    botLog('Created local multi-post tracker file (last_posts.json)');
  } catch (err) {
    botLog(`Failed to create multi-post tracker file: ${err.message}`);
  }
}

// Get the saved post ID for a user
function getSavedPostId(username) {
  try {
    if (fs.existsSync(LAST_POSTS_FILE)) {
      const cache = JSON.parse(fs.readFileSync(LAST_POSTS_FILE, 'utf8'));
      if (cache[username.toLowerCase()]) {
        return cache[username.toLowerCase()];
      }
    }
  } catch (err) {
    botLog(`Error reading saved post ID for @${username} from last_posts.json: ${err.message}`);
  }
  // Fallback to legacy single file
  try {
    if (fs.existsSync(LAST_POST_FILE)) {
      return fs.readFileSync(LAST_POST_FILE, 'utf8').trim();
    }
  } catch (err) {}
  return '';
}

// Save the post ID for a user
function savePostId(username, id) {
  try {
    let cache = {};
    if (fs.existsSync(LAST_POSTS_FILE)) {
      cache = JSON.parse(fs.readFileSync(LAST_POSTS_FILE, 'utf8'));
    }
    cache[username.toLowerCase()] = id;
    fs.writeFileSync(LAST_POSTS_FILE, JSON.stringify(cache, null, 2), 'utf8');
    botLog(`Saved new post ID for @${username} to local last_posts.json: ${id}`);

    // Also write to legacy single file for backward compatibility
    fs.writeFileSync(LAST_POST_FILE, id, 'utf8');
  } catch (err) {
    botLog(`Error saving post ID for @${username}: ${err.message}`);
  }
}

// Helper to extract post data robustly from any API response format
export function parseInstagramResponse(data, username) {
  if (!data) return null;

  // 1. Direct array of posts
  if (Array.isArray(data) && data.length > 0) {
    return parseSinglePost(data[0], username);
  }

  // 2. Wrap inside a data/items property
  if (data.data) {
    if (Array.isArray(data.data) && data.data.length > 0) {
      return parseSinglePost(data.data[0], username);
    }
    if (data.data.items && Array.isArray(data.data.items) && data.data.items.length > 0) {
      return parseSinglePost(data.data.items[0], username);
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
    return parseSinglePost(data, username);
  }

  return null;
}

function parseSinglePost(post, username) {
  const shortcode = post.shortcode || post.code || post.id || '';
  const id = post.id || shortcode;
  const caption = post.caption || post.text || post.title || 'New Instagram Post!';
  const link = post.link || post.url || (shortcode ? `https://www.instagram.com/p/${shortcode}/` : `https://www.instagram.com/@${username || INSTAGRAM_USERNAME}`);
  const mediaUrl = post.display_url || post.image || post.media_url || post.thumbnail || post.thumbnail_url || '';

  return { id, shortcode, caption, link, mediaUrl };
}

// The core Instagram Polling / Check Function
export async function checkInstagramPosts(username = INSTAGRAM_USERNAME, channelId = TARGET_CHANNEL_ID) {
  if (!username) {
    botLog('No Instagram username configured to check.');
    return null;
  }
  botLog(`Initiating Instagram check for @${username}...`);
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
    botLog(`Fetching from API: ${API_URL} for @${username}`);
    const response = await axios.get(API_URL, {
      params: { username },
      headers,
      timeout: 10000 // 10 seconds timeout
    });

    post = parseInstagramResponse(response.data, username);

    if (!post) {
      botLog(`Could not extract any posts from API response for @${username}. Check if structure matches or API is valid.`);
      return null;
    }

    botLog(`Latest post fetched for @${username}: ID: ${post.id}, Shortcode: ${post.shortcode}`);
    lastCheckedPost = post;

    const savedId = getSavedPostId(username);
    botLog(`Stored Post ID for @${username} is: "${savedId}"`);

    // If it's a brand new post
    if (post.id && post.id !== savedId) {
      botLog(`New post detected for @${username}! Storing ID and sending Discord notification.`);
      savePostId(username, post.id);

      // Send to Discord if bot is ready
      if (isBotReady && channelId && client) {
        const channel = await client.channels.fetch(channelId).catch(err => {
          botLog(`Failed to fetch target channel ${channelId}: ${err.message}`);
          return null;
        });

        if (channel && channel.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor('#E1306C') // Instagram pinkish red
            .setTitle(`📸 New Post by @${username}`)
            .setURL(post.link)
            .setDescription(post.caption.length > 200 ? `${post.caption.substring(0, 197)}...` : post.caption)
            .setImage(post.mediaUrl || null)
            .setTimestamp()
            .setFooter({ text: 'Instagram Tracker', iconURL: 'https://cdn-icons-png.flaticon.com/512/174/174855.png' });

          await channel.send({
            content: `📢 **Hey everyone! @${username} just posted on Instagram!**`,
            embeds: [embed]
          });
          botLog(`Successfully sent Instagram notification embed for @${username} to channel ${channelId}`);
        } else {
          botLog(`Target channel ${channelId} is not a valid text channel or is unreachable.`);
        }
      } else {
        if (!isBotReady) {
          botLog(`Bot is not logged into Discord; skipped sending message for @${username} but recorded ID.`);
        }
        if (!channelId) {
          botLog(`Target channel ID is not configured for @${username}; skipped sending Discord message.`);
        }
      }
    } else {
      botLog(`No new posts detected for @${username} (matches stored ID).`);
    }

    return post;
  } catch (error) {
    botLog(`Error checking Instagram posts for @${username}: ${error.message}`);
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
      .setDescription('Check live parameters and status of the tracking agent.'),
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Set up the Instagram target username and Discord announcement channel.')
      .addStringOption(option =>
        option.setName('username')
          .setDescription('The Instagram handle to track')
          .setRequired(true)
      )
      .addChannelOption(option =>
        option.setName('channel')
          .setDescription('The channel to send the embeds to')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
      .setName('editupdate')
      .setDescription('View and delete active Instagram tracking setups.')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    const presenceString = `Watching @${INSTAGRAM_USERNAME || 'multiple accounts'}`;
    client.user.setActivity(presenceString, { type: ActivityType.Watching });
    botLog(`Presence set to: "Watching @${INSTAGRAM_USERNAME}"`);

    // Update bot bio / description
    try {
      client.application.edit({
        description: "Your dedicated social media recon bot. Tracking the timeline so you don't have to. 📡"
      }).then(() => {
        botLog('Successfully updated bot application bio/description!');
      }).catch(err => {
        botLog(`Could not update bot bio: ${err.message}`);
      });
    } catch (err) {
      botLog(`Failed to update application bio: ${err.message}`);
    }

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
      
      const pollIteration = async () => {
        if (!fs.existsSync(CONFIG_PATH)) {
          console.log('[Bot] config.json does not exist yet. Polling skipped.');
          return;
        }
        try {
          const fileContent = fs.readFileSync(CONFIG_PATH, 'utf8');
          const targets = JSON.parse(fileContent);
          
          if (!Array.isArray(targets) || targets.length === 0) {
            console.log('[Bot] No Instagram targets found in config.json. Polling skipped.');
            return;
          }

          botLog(`Polling loop running dynamically for ${targets.length} targets`);

          for (const target of targets) {
            const username = target.instagramUsername || target.username;
            const channelId = target.channelId || target.channel;
            if (username) {
              botLog(`Triggering poll for target: @${username} (Channel: ${channelId})`);
              await checkInstagramPosts(username, channelId);
              // Small delay to prevent API rate limits or spamming if multiple accounts exist
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
        } catch (err) {
          console.log(`[Bot] Error reading/parsing config.json in polling loop: ${err.message}`);
        }
      };

      // Run immediately
      pollIteration();

      // Interval loop every 15 minutes
      setInterval(pollIteration, 15 * 60 * 1000);
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
          .setDescription(`Hello! I am a production-ready Discord Bot designed to track **@${INSTAGRAM_USERNAME || 'multiple accounts'}** and announce new posts automatically.`)
          .addFields(
            { name: '📋 Configuration', value: `• **Prefix:** \`${BOT_PREFIX}\`\n• **Target Channel:** <#${TARGET_CHANNEL_ID || 'Not set'}>\n• **Tracking Account:** [@${INSTAGRAM_USERNAME || 'Not set'}](https://instagram.com/${INSTAGRAM_USERNAME || ''})` },
            { name: '✨ Commands', value: `• \`/help\` or \`${BOT_PREFIX}help\` - Displays this information menu.\n• \`/status\` or \`${BOT_PREFIX}status\` - Check tracking and server parameters.\n• \`/setup\` - Set up Instagram target username and announcement channel.\n• \`/editupdate\` - View and delete active Instagram tracking setups.` },
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
            { name: '📸 Tracking Target', value: `[@${INSTAGRAM_USERNAME || 'multiple'}](https://instagram.com/${INSTAGRAM_USERNAME || ''})`, inline: true },
            { name: '🕒 Last Fetched Post', value: lastCheckedPost ? `[${lastCheckedPost.shortcode || lastCheckedPost.id}](${lastCheckedPost.link})` : 'None yet' }
          )
          .setTimestamp();

        await message.reply({ embeds: [statusEmbed] });
      } catch (err) {
        botLog(`Failed to send status reply: ${err.message}`);
      }
    }
  });

  // Bot Interaction Create event handler (for slash commands and components)
  client.on('interactionCreate', async (interaction) => {
    // Handle Select Menu Selection
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'delete_menu') {
        botLog(`User ${interaction.user.username} selected an account to delete tracking via select menu`);
        try {
          const usernameToDelete = interaction.values[0];
          
          let targets = [];
          if (fs.existsSync(CONFIG_PATH)) {
            try {
              const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
              if (Array.isArray(data)) {
                targets = data;
              }
            } catch (_) {}
          }

          targets = targets.filter(t => (t.instagramUsername || t.username || '').toLowerCase() !== usernameToDelete.toLowerCase());

          fs.writeFileSync(CONFIG_PATH, JSON.stringify(targets, null, 2), 'utf8');
          botLog(`Removed tracking target: @${usernameToDelete}. Remaining: ${targets.length}`);

          // Update active single-account variables dynamically
          if (targets.length > 0) {
            INSTAGRAM_USERNAME = targets[0].instagramUsername || targets[0].username || '';
            TARGET_CHANNEL_ID = targets[0].channelId || targets[0].channel || '';
          } else {
            INSTAGRAM_USERNAME = '';
            TARGET_CHANNEL_ID = '';
          }

          // Update presence dynamically
          if (client && isBotReady) {
            const presenceString = `Watching @${INSTAGRAM_USERNAME || 'multiple accounts'}`;
            client.user.setActivity(presenceString, { type: ActivityType.Watching });
          }

          await interaction.update({
            content: `✅ Successfully stopped tracking **@${usernameToDelete}**.`,
            embeds: [],
            components: []
          });
        } catch (err) {
          botLog(`Failed to handle delete select menu: ${err.message}`);
          await interaction.reply({
            content: `❌ **Failed to delete tracking setup:** ${err.message}`,
            ephemeral: true
          }).catch(() => {});
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'help') {
      botLog(`User ${interaction.user.username} executed /help slash command`);
      try {
        const helpEmbed = new EmbedBuilder()
          .setColor('#5865F2') // Discord blurple
          .setTitle('🤖 Instagram Tracker Bot Help')
          .setDescription(`Hello! I am a production-ready Discord Bot designed to track **@${INSTAGRAM_USERNAME || 'multiple accounts'}** and announce new posts automatically.`)
          .addFields(
            { name: '📋 Configuration', value: `• **Prefix:** \`${BOT_PREFIX}\`\n• **Target Channel:** <#${TARGET_CHANNEL_ID || 'Not set'}>\n• **Tracking Account:** [@${INSTAGRAM_USERNAME || 'Not set'}](https://instagram.com/${INSTAGRAM_USERNAME || ''})` },
            { name: '✨ Commands', value: `• \`/help\` or \`${BOT_PREFIX}help\` - Displays this information menu.\n• \`/status\` or \`${BOT_PREFIX}status\` - Check tracking and server parameters.\n• \`/setup\` - Set up Instagram target username and announcement channel.\n• \`/editupdate\` - View and delete active Instagram tracking setups.` },
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
            { name: '📸 Tracking Target', value: `[@${INSTAGRAM_USERNAME || 'multiple'}](https://instagram.com/${INSTAGRAM_USERNAME || ''})`, inline: true },
            { name: '🕒 Last Fetched Post', value: lastCheckedPost ? `[${lastCheckedPost.shortcode || lastCheckedPost.id}](${lastCheckedPost.link})` : 'None yet' }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [statusEmbed] });
      } catch (err) {
        botLog(`Failed to respond to /status interaction: ${err.message}`);
      }
    }

    if (commandName === 'setup') {
      botLog(`User ${interaction.user.username} executed /setup slash command`);
      try {
        const username = interaction.options.getString('username', true);
        const channel = interaction.options.getChannel('channel', true);

        let targets = [];
        if (fs.existsSync(CONFIG_PATH)) {
          try {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            if (Array.isArray(data)) {
              targets = data;
            } else if (data && typeof data === 'object') {
              const oldUser = data.username || data.instagramUsername;
              const oldChannel = data.channel || data.channelId;
              if (oldUser) {
                targets.push({ instagramUsername: oldUser, channelId: oldChannel || '' });
              }
            }
          } catch (_) {}
        }

        const isDuplicate = targets.some(t => (t.instagramUsername || t.username || '').toLowerCase() === username.toLowerCase());
        if (isDuplicate) {
          return await interaction.reply({
            content: `⚠️ **Tracking setup already exists for @${username}.**`,
            ephemeral: true
          });
        }

        targets.push({
          instagramUsername: username,
          channelId: channel.id
        });

        fs.writeFileSync(CONFIG_PATH, JSON.stringify(targets, null, 2), 'utf8');
        botLog(`Successfully appended new setup configuration to config.json: Target username: ${username}, Target Channel: ${channel.id}`);

        // Update active in-memory variables dynamically
        INSTAGRAM_USERNAME = username;
        TARGET_CHANNEL_ID = channel.id;

        // Update presence dynamically
        if (client && isBotReady) {
          const presenceString = `Watching @${INSTAGRAM_USERNAME}`;
          client.user.setActivity(presenceString, { type: ActivityType.Watching });
          botLog(`Presence updated to: "Watching @${INSTAGRAM_USERNAME}"`);
        }

        await interaction.reply({
          content: `✅ **Setup completed successfully!**\n• **Instagram Handle:** @${username}\n• **Announcement Channel:** <#${channel.id}>`,
          ephemeral: true
        });
      } catch (err) {
        botLog(`Failed to execute /setup command: ${err.message}`);
        await interaction.reply({
          content: `❌ **Failed to complete setup:** ${err.message}`,
          ephemeral: true
        }).catch(() => {});
      }
    }

    if (commandName === 'editupdate') {
      botLog(`User ${interaction.user.username} executed /editupdate slash command`);
      try {
        let targets = [];
        if (fs.existsSync(CONFIG_PATH)) {
          try {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            if (Array.isArray(data)) {
              targets = data;
            }
          } catch (_) {}
        }

        if (targets.length === 0) {
          return await interaction.reply({
            content: '❌ **No active Instagram tracking setups are configured.**',
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🗂️ Active Instagram Tracking Setups')
          .setDescription('Here is a list of all active Instagram accounts being tracked. Use the dropdown menu below to stop tracking any account:')
          .setTimestamp();

        const fields = targets.map((target, index) => ({
          name: `${index + 1}. @${target.instagramUsername || target.username}`,
          value: `Announcement Channel: <#${target.channelId || target.channel}>`,
          inline: false
        }));

        embed.addFields(fields);

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('delete_menu')
          .setPlaceholder('Select an Instagram account to delete tracking...')
          .addOptions(
            targets.map(target => {
              const uName = target.instagramUsername || target.username;
              return {
                label: `@${uName}`,
                description: `Stop tracking @${uName}`,
                value: uName
              };
            })
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        });
      } catch (err) {
        botLog(`Failed to execute /editupdate command: ${err.message}`);
        await interaction.reply({
          content: `❌ **Failed to retrieve tracking setups:** ${err.message}`,
          ephemeral: true
        }).catch(() => {});
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
