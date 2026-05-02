const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("Bot running"));

app.listen(3000, () => {
  console.log("Web server running");
});

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder
} = require("discord.js");

const { createClient } = require("@supabase/supabase-js");

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ===== CONFIG =====
const GUILD_ID = "1461112510798233927";
const FORUM_CHANNEL_ID = "1500206600529641482";
const STAFF_ROLE_ID = "1461112511301685296";

// ===== READY =====
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== CREATE OR GET TICKET =====
async function createTicket(user, firstMessage) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const forum = await guild.channels.fetch(FORUM_CHANNEL_ID);

  const thread = await forum.threads.create({
    name: `ticket-${user.username}`,
    message: {
      content: `<@&${STAFF_ROLE_ID}> New ticket from ${user.tag}`
    }
  });

  const { data: ticket } = await supabase
    .from("tickets")
    .insert({
      user_id: user.id,
      thread_id: thread.id,
      open: true
    })
    .select()
    .single();

  // 🔥 IMPORTANT: show FIRST message immediately
  await thread.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("📩 New Ticket Started")
        .setDescription(`**First message:**\n${firstMessage.content || "*no text*"}`)
        .setColor("Blue")
    ],
    files: [...firstMessage.attachments.values()]
  });

  await supabase.from("messages").insert({
    ticket_id: ticket.id,
    author_id: user.id,
    content: firstMessage.content,
    attachments: JSON.stringify([...firstMessage.attachments.values()].map(a => a.url))
  });

  await user.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("Ticket Created")
        .setDescription("We received your message and opened a ticket.")
        .setColor("Green")
    ]
  });

  await firstMessage.react("📩");

  return ticket;
}

// ===== MESSAGE HANDLER =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // =========================
  // USER DM HANDLER
  // =========================
  if (message.channel.type === ChannelType.DM) {
    const { data: existing } = await supabase
      .from("tickets")
      .select("*")
      .eq("user_id", message.author.id)
      .eq("open", true)
      .single();

    let ticket = existing;

    if (!ticket) {
      ticket = await createTicket(message.author, message);
      return;
    }

    const thread = await client.channels.fetch(ticket.thread_id);

    if (!thread) return;

    await thread.send({
      content: `**${message.author.tag}:** ${message.content || "*no text*"}`,
      files: [...message.attachments.values()]
    });

    await supabase.from("messages").insert({
      ticket_id: ticket.id,
      author_id: message.author.id,
      content: message.content,
      attachments: JSON.stringify([...message.attachments.values()].map(a => a.url))
    });
  }

  // =========================
  // STAFF HANDLER
  // =========================
  if (!message.guild) return;
  if (!message.member) return;

  const isThread =
    message.channel.type === ChannelType.PublicThread ||
    message.channel.type === ChannelType.PrivateThread;

  if (!isThread) return;

  if (!message.member.roles.cache.has(STAFF_ROLE_ID)) return;

  const { data: ticket } = await supabase
    .from("tickets")
    .select("*")
    .eq("thread_id", message.channel.id)
    .single();

  if (!ticket) return;

  const user = await client.users.fetch(ticket.user_id);

  // =========================
  // REPLY
  // =========================
if (message.content.startsWith("!r ")) {
  const text = message.content.slice(3);

  try {
    const user = await client.users.fetch(ticket.user_id);

    await user.send({
      content: `💬 **Staff Reply:**\n${text}`
    });

    await supabase.from("messages").insert({
      ticket_id: ticket.id,
      author_id: message.author.id,
      content: text
    });

    await message.react("✅");
  } catch (err) {
    console.log("❌ FAILED TO SEND DM:", err);
    await message.react("❌");
  }
}

  // =========================
  // CLOSE
  // =========================
  if (message.content === "!close") {
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("Ticket Closed")
          .setDescription("Your ticket has been closed.")
          .setColor("Red")
      ]
    });

    await supabase
      .from("tickets")
      .update({ open: false })
      .eq("id", ticket.id);

    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("ticket_id", ticket.id);

    let transcript = (messages || [])
      .map(m => `${m.author_id}: ${m.content}`)
      .join("\n");

    await message.channel.send({
      content: "📄 Transcript:\n```" + transcript + "```"
    });

    await message.channel.setLocked(true);
    await message.channel.setArchived(true);
  }
});

client.login(process.env.TOKEN);
