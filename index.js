```js
const express = require("express");
const app = express();

app.get("/", (_, res) => res.send("icona modmail running"));

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server running");
});

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder,
  ActivityType
} = require("discord.js");

const { createClient } = require("@supabase/supabase-js");

// ================= CONFIG =================
const GUILD_ID = "1461112510798233927";
const FORUM_CHANNEL_ID = "1500206600529641482";
const STAFF_ROLE_ID = "1461112511301685296";

// ================= ENVIRONMENT CHECK =================
if (!process.env.TOKEN) {
  console.error("STARTUP ERROR: TOKEN is missing from Render environment variables.");
  process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error("STARTUP ERROR: SUPABASE_URL or SUPABASE_KEY is missing.");
  process.exit(1);
}

// ================= SUPABASE =================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ================= DISCORD CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User
  ]
});

// ================= READY =================
client.once("ready", () => {
  console.log(`BOT ONLINE: ${client.user.tag}`);
  console.log(`Watching DMs and forum channel ${FORUM_CHANNEL_ID}`);

  client.user.setPresence({
    activities: [
      {
        name: "dm me for inquiries <3",
        type: ActivityType.Streaming,
        url: "https://twitch.tv/discord"
      }
    ],
    status: "online"
  });
});

// ================= MESSAGE SYSTEM =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  console.log(
    `MESSAGE RECEIVED | Author: ${message.author.tag} | ` +
    `Location: ${message.guild ? message.guild.name : "DM"}`
  );

  try {
    // ==================================================
    // USER DMS
    // ==================================================
    if (!message.guild) {
      console.log(`Processing DM from ${message.author.tag}`);

      // Fetch server
      let guild;

      try {
        guild = await client.guilds.fetch(GUILD_ID);
      } catch (err) {
        console.error("Could not fetch configured server:", err);

        await message.author.send(
          "Sorry, the modmail bot cannot access its server right now. Please contact staff."
        ).catch(() => {});

        return;
      }

      // Fetch forum
      let forum;

      try {
        forum = await guild.channels.fetch(FORUM_CHANNEL_ID);
      } catch (err) {
        console.error("Could not fetch configured forum:", err);

        await message.author.send(
          "Sorry, the modmail forum could not be accessed. Please contact staff."
        ).catch(() => {});

        return;
      }

      if (!forum || forum.type !== ChannelType.GuildForum) {
        console.error(
          `Invalid forum channel. Found type: ${forum?.type ?? "not found"}`
        );

        await message.author.send(
          "Sorry, the configured modmail forum is invalid. Please contact staff."
        ).catch(() => {});

        return;
      }

      // Check for an existing open ticket
      let existingTicket;

      const { data, error: lookupError } = await supabase
        .from("tickets")
        .select("user_id, thread_id, open")
        .eq("user_id", message.author.id)
        .eq("open", true)
        .maybeSingle();

      if (lookupError) {
        console.error("SUPABASE LOOKUP ERROR:", lookupError);

        await message.author.send(
          "Sorry, the ticket database is currently unavailable. Please contact staff."
        ).catch(() => {});

        return;
      }

      existingTicket = data;

      let thread = null;

      // Try to reuse the existing ticket thread
      if (existingTicket?.thread_id) {
        thread = await client.channels
          .fetch(existingTicket.thread_id)
          .catch((err) => {
            console.error("Could not fetch existing thread:", err);
            return null;
          });

        if (thread && !thread.isThread()) {
          console.error("Saved ticket channel is not a thread.");
          thread = null;
        }

        if (thread?.archived) {
          await thread.setArchived(false).catch((err) => {
            console.error("Could not unarchive existing thread:", err);
          });
        }
      }

      // Create a new ticket if needed
      if (!thread) {
        console.log(`Creating ticket for ${message.author.tag}`);

        try {
          thread = await forum.threads.create({
            name: `ticket-${message.author.username}`.slice(0, 100),
            message: {
              content: `new thread from **${message.author.tag}** (${message.author.id})`
            }
          });
        } catch (err) {
          console.error("THREAD CREATION ERROR:", err);

          await message.author.send(
            "Sorry, I couldn't create your ticket. Please contact staff."
          ).catch(() => {});

          return;
        }

        console.log(`Thread created: ${thread.id}`);

        // Save ticket to Supabase.
        // If a previous row exists for this user, update it.
        // Otherwise, insert a new row.
        if (existingTicket) {
          const { error: updateError } = await supabase
            .from("tickets")
            .update({
              thread_id: thread.id,
              open: true
            })
            .eq("user_id", message.author.id);

          if (updateError) {
            console.error("SUPABASE TICKET UPDATE ERROR:", updateError);

            await thread.send(
              "Warning: this ticket could not be saved in the database. Please notify staff."
            ).catch(console.error);
          }
        } else {
          const { error: insertError } = await supabase
            .from("tickets")
            .insert({
              user_id: message.author.id,
              thread_id: thread.id,
              open: true
            });

          if (insertError) {
            console.error("SUPABASE TICKET INSERT ERROR:", insertError);

            await thread.send(
              "Warning: this ticket could not be saved in the database. Please notify staff."
            ).catch(console.error);
          }
        }

        // Send ticket-opened confirmation
        await message.author.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("<a:b_heels:1501198524782743602> ⋯ new thread opened")
              .setDescription(
                "please be patient while waiting for a response.\n" +
                "if needed, ping staff in the server after 24h."
              )
              .setColor(0x4F4F4F)
          ]
        }).catch((err) => {
          console.error("Could not send ticket-opened confirmation:", err);
        });
      }

      // Forward the user's message to the thread
      const userEmbed = new EmbedBuilder()
        .setDescription(message.content || "*no text attached*")
        .setColor(0xFFFFFF)
        .setAuthor({
          name: message.author.tag,
          iconURL: message.author.displayAvatarURL()
        });

      const attachment = message.attachments.first();

      if (attachment?.contentType?.startsWith("image/")) {
        userEmbed.setImage(attachment.url);
      } else if (attachment) {
        userEmbed.addFields({
          name: "Attachment",
          value: attachment.url
        });
      }

      try {
        await thread.send({ embeds: [userEmbed] });
        console.log(`USER DM FORWARDED | ${message.author.tag} -> ${thread.id}`);
      } catch (err) {
        console.error("COULD NOT FORWARD USER DM:", err);

        await message.author.send(
          "Your ticket exists, but I couldn't forward your message to staff. Please contact staff."
        ).catch(() => {});
      }

      return;
    }

    // ==================================================
    // STAFF REPLIES IN TICKET THREADS
    // ==================================================
    const isThread =
      message.channel.type === ChannelType.PublicThread ||
      message.channel.type === ChannelType.PrivateThread;

    if (!isThread) return;

    if (message.channel.parentId !== FORUM_CHANNEL_ID) return;

    const member =
      message.member ||
      await message.guild.members.fetch(message.author.id).catch(() => null);

    if (!member?.roles.cache.has(STAFF_ROLE_ID)) {
      console.log(`Thread message ignored: ${message.author.tag} is not staff.`);
      return;
    }

    // Find the ticket belonging to this thread
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("user_id, thread_id, open")
      .eq("thread_id", message.channel.id)
      .eq("open", true)
      .maybeSingle();

    if (ticketError) {
      console.error("SUPABASE STAFF LOOKUP ERROR:", ticketError);
      return;
    }

    if (!ticket) {
      console.log(`No open ticket found for thread ${message.channel.id}`);
      return;
    }

    const user = await client.users
      .fetch(ticket.user_id)
      .catch((err) => {
        console.error("Could not fetch ticket user:", err);
        return null;
      });

    if (!user) return;

    // ================= CLOSE TICKET =================
    if (message.content.trim() === "!close") {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("<a:w_bubble:1501198513302667306> ⋯ thread closed")
            .setDescription("ticket closed by staff.")
            .setColor(0x4F4F4F)
        ]
      });

      await user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("<a:w_bubble:1501198513302667306> ⋯ thread closed")
            .setDescription(
              "this ticket has been closed.\n" +
              "send a new message to open a new thread."
            )
            .setColor(0x4F4F4F)
        ]
      }).catch((err) => {
        console.error("Could not DM ticket closure:", err);
      });

      const { error: updateError } = await supabase
        .from("tickets")
        .update({ open: false })
        .eq("thread_id", message.channel.id);

      if (updateError) {
        console.error("Could not update ticket status:", updateError);

        await message.channel.send(
          "Warning: I couldn't update the ticket status in the database."
        );

        return;
      }

      await message.channel.setLocked(true).catch(console.error);
      await message.channel.setArchived(true).catch(console.error);

      console.log(`TICKET CLOSED | ${message.channel.id} by ${message.author.tag}`);
      return;
    }

    // ================= STAFF REPLY =================
    const staffEmbed = new EmbedBuilder()
      .setDescription(message.content || "*no text attached*")
      .setColor(0xFA9370)
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL()
      });

    const attachment = message.attachments.first();

    if (attachment?.contentType?.startsWith("image/")) {
      staffEmbed.setImage(attachment.url);
    } else if (attachment) {
      staffEmbed.addFields({
        name: "Attachment",
        value: attachment.url
      });
    }

    try {
      await user.send({ embeds: [staffEmbed] });

      console.log(
        `STAFF REPLY DELIVERED | ${message.author.tag} -> ${user.tag}`
      );
    } catch (err) {
      console.error("COULD NOT DM STAFF REPLY:", err);

      await message.reply(
        "I couldn't deliver this reply. The user may have DMs disabled."
      ).catch(console.error);
    }
  } catch (err) {
    console.error("MESSAGE SYSTEM ERROR:", err);
  }
});

// ================= DISCORD LOGIN =================
client.login(process.env.TOKEN).catch((err) => {
  console.error("DISCORD LOGIN FAILED:", err);
});
```
