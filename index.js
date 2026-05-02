const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("Bot running"));

app.listen(3000, () => {
  console.log("Web server running on port 3000");
});

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder
} = require("discord.js");

const { createClient } = require("@supabase/supabase-js");

// ================= CONFIG =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const GUILD_ID = "1461112510798233927";
const FORUM_CHANNEL_ID = "1500206600529641482";
const STAFF_ROLE_ID = "1461112511301685296";

// ================= READY =================
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ================= HELPERS =================
async function getTicketByUser(userId) {
  const { data } = await supabase
    .from("tickets")
    .select("*")
    .eq("user_id", userId)
    .eq("open", true)
    .single();

  return data;
}

async function getTicketByThread(threadId) {
  const { data } = await supabase
    .from("tickets")
    .select("*")
    .eq("thread_id", threadId)
    .single();

  return data;
}

// ================= CREATE TICKET =================
async function createTicket(user, message) {
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

  // FIRST MESSAGE DISPLAYED
  await thread.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("📩 New Ticket")
        .setDescription(message.content || "*no text*")
        .setColor("Blue")
    ],
    files: [...message.attachments.values()]
  });

  await user.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("Ticket Opened")
        .setDescription("Staff will respond soon.")
        .setColor("Green")
    ]
  });

  await message.react("📩");

  return ticket;
}

// ================= MAIN SYSTEM =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // ================= USER DM =================
  if (message.channel.type === ChannelType.DM) {
    let ticket = await getTicketByUser(message.author.id);

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

  // ================= STAFF THREAD =================
  if (!message.guild) return;

  const isThread =
    message.channel.type === ChannelType.PublicThread ||
    message.channel.type === ChannelType.PrivateThread;

  if (!isThread) return;

  if (!message.member?.roles.cache.has(STAFF_ROLE_ID)) return;

  const ticket = await getTicketByThread(message.channel.id);
  if (!ticket) return;

  const user = await client.users.fetch(ticket.user_id);

  // ================= REPLY (FIXED CORE) =================
  try {
    await user.send(`💬 **Staff:** ${message.content}`);
  } catch (err) {
    console.log("DM ERROR:", err);
  }

  await supabase.from("messages").insert({
    ticket_id: ticket.id,
    author_id: message.author.id,
    content: message.content
  });

  // ================= CLOSE =================
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

    const transcript = (messages || [])
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
