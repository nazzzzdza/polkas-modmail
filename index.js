const express = require("express");
const app = express();

app.get("/", (_, res) => res.send("icona modmail running"));

app.listen(3000, () => {
  console.log("web server running");
});

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder
} = require("discord.js");

const { createClient } = require("@supabase/supabase-js");

// ================= SUPABASE =================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ================= CLIENT =================
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
    Partials.User,
    Partials.GuildMember
  ]
});

// ================= CONFIG =================
const GUILD_ID = "1461112510798233927";
const FORUM_CHANNEL_ID = "1500206600529641482";
const STAFF_ROLE_ID = "1461112511301685296";

// ================= READY =================
client.once("ready", () => {
  console.log(`READY: ${client.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: "dm me for inquiries <3",
        type: 1,
        url: "https://twitch.tv/discord"
      }
    ],
    status: "online"
  });
});

// ================= MESSAGE SYSTEM =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  try {
    // ================= USER DM =================
    if (!message.guild) {
      const guild = await client.guilds.fetch(GUILD_ID);
      const forum = await guild.channels.fetch(FORUM_CHANNEL_ID);

      if (!forum || forum.type !== ChannelType.GuildForum) {
        console.error(
          "Configured forum channel was not found or is not a forum channel."
        );
        return;
      }

      // CHECK EXISTING OPEN TICKET
      const { data: existingTicket, error: lookupError } = await supabase
        .from("tickets")
        .select("*")
        .eq("user_id", message.author.id)
        .eq("open", true)
        .maybeSingle();

      if (lookupError) {
        console.error("Existing ticket lookup error:", lookupError);
        return;
      }

      let thread = null;

      // ================= EXISTING THREAD =================
      if (existingTicket) {
        thread = await client.channels
          .fetch(existingTicket.thread_id)
          .catch((err) => {
            console.error("Could not fetch existing ticket thread:", err);
            return null;
          });

        // If the thread was deleted or is unavailable, allow a new ticket.
        if (thread && !thread.isThread()) {
          console.error("Stored ticket channel is not a thread.");
          thread = null;
        }
      }

      // ================= CREATE THREAD =================
      if (!thread) {
        thread = await forum.threads.create({
          name: `ticket-${message.author.username}`.slice(0, 100),
          message: {
            content: `new thread from **${message.author.tag}**`
          }
        });

        const { error: insertError } = await supabase
          .from("tickets")
          .upsert(
            {
              user_id: message.author.id,
              thread_id: thread.id,
              open: true
            },
            { onConflict: "user_id" }
          );

        if (insertError) {
          console.error("Could not save new ticket to Supabase:", insertError);
          await thread.send(
            "couldn't save this ticket to the database, contact owner"
          );
          return;
        }

        // OPEN MESSAGE
        try {
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
          });
        } catch (err) {
          console.error("Could not send ticket-opened DM:", err);
        }
      }

      // ================= USER EMBED =================
      const embed = new EmbedBuilder()
        .setDescription(message.content || "*no text attached*")
        .setColor(0xFFFFFF)
        .setAuthor({
          name: message.author.tag,
          iconURL: message.author.displayAvatarURL()
        });

      const firstAttachment = message.attachments.first();

      if (firstAttachment?.contentType?.startsWith("image/")) {
        embed.setImage(firstAttachment.url);
      } else if (firstAttachment) {
        embed.addFields({
          name: "Attachment",
          value: firstAttachment.url
        });
      }

      // SEND TO THREAD
      await thread.send({ embeds: [embed] });
      return;
    }

    // ================= STAFF =================
    const isThread =
      message.channel.type === ChannelType.PublicThread ||
      message.channel.type === ChannelType.PrivateThread;

    if (!isThread) return;

    // Confirm the member has the configured staff role.
    const member =
      message.member ||
      await message.guild.members.fetch(message.author.id).catch(() => null);

    if (!member?.roles.cache.has(STAFF_ROLE_ID)) {
      return;
    }

    // FIND OPEN TICKET FOR THIS THREAD
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("*")
      .eq("thread_id", message.channel.id)
      .eq("open", true)
      .maybeSingle();

    if (ticketError) {
      console.error("Supabase ticket lookup error:", ticketError);
      return;
    }

    if (!ticket) {
      console.log(
        `no open ticket found for thread ${message.channel.id}.`
      );
      return;
    }

    const user = await client.users
      .fetch(ticket.user_id)
      .catch((err) => {
        console.error("could not fetch ticket user:", err);
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

      try {
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
        });
      } catch (err) {
        console.error("could not dm ticket closure to user:", err);
      }

      const { error: updateError } = await supabase
        .from("tickets")
        .update({ open: false })
        .eq("thread_id", message.channel.id);

      if (updateError) {
        console.error("Could not update ticket status:", updateError);
        await message.channel.send(
          "ticket status could not be updated"
        );
        return;
      }

      await message.channel.setArchived(true);
      await message.channel.setLocked(true);

      console.log(`ticket ${message.channel.id} closed by ${message.author.tag}`);
      return;
    }

    // ================= STAFF REPLY EMBED =================
    const embed = new EmbedBuilder()
      .setDescription(message.content || "*no text attached*")
      .setColor(0xFA9370)
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL()
      });

    const firstAttachment = message.attachments.first();

    if (firstAttachment?.contentType?.startsWith("image/")) {
      embed.setImage(firstAttachment.url);
    } else if (firstAttachment) {
      embed.addFields({
        name: "Attachment",
        value: firstAttachment.url
      });
    }

    // ================= SEND STAFF REPLY TO USER =================
    try {
      await user.send({ embeds: [embed] });

      console.log(
        `staff reply delivered to ${user.tag} from thread ${message.channel.id}`
      );
    } catch (err) {
      console.error("Could not DM staff reply to ticket user:", err);

      await message.reply(
        "couldn't deliver that reply to the user, may have dms disabled."
      ).catch(console.error);
    }
  } catch (err) {
    console.error("MESSAGE SYSTEM ERROR:", err);
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
