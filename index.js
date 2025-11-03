// ============================
// Barra Venezuela - Moderación & Bienvenidas Bot + Tickets con Transcript
// ============================

require("dotenv").config();
const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

// ---------------------------
// CONFIGURACIÓN
// ---------------------------
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const FAREWELL_CHANNEL_ID = process.env.FAREWELL_CHANNEL_ID;

// Tickets
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null;
const TICKET_PANEL_CHANNEL_ID = process.env.TICKET_PANEL_CHANNEL_ID || null;
const TICKET_LOG_CHANNEL = "1434771587239907482"; // transcripts .txt

const ALLOWED_ROLES = [
  "1434753682716622912", // admin
  "1434753682716622911", // jefe
  "1434753682716622910", // subjefe
];

const CIVIL_ROLE = "1434766095646199828";
const SANCTION_LOG_CHANNEL = "1434763974951440474";
const GENERAL_LOG_CHANNEL = "1434767106808873131";
const LOGO_URL = "https://i.postimg.cc/90Jssfkg/26b87ec005339ffd79d27e6cf031b4f3.png";

// ---------------------------
// CLIENTE
// ---------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // para formatear transcript con contenido
  ],
});

// ---------------------------
// ANTI-CRASH
// ---------------------------
process.on("unhandledRejection", (err) => console.log("⚠️ Error no manejado:", err));
process.on("uncaughtException", (err) => console.log("💥 Excepción no controlada:", err));
process.on("multipleResolves", () => {});

// ---------------------------
// HELPERS
// ---------------------------
const isStaff = (member) =>
  member.permissions.has(PermissionsBitField.Flags.Administrator) ||
  member.roles.cache.some((r) => ALLOWED_ROLES.includes(r.id));

async function sendGeneralLog(interaction, embed) {
  try {
    const logChannel = interaction.guild.channels.cache.get(GENERAL_LOG_CHANNEL);
    if (logChannel) await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.log("Error enviando log general:", err);
  }
}

async function buildTranscriptTXT(channel, closedByTag) {
  // descarga todos los mensajes (hasta 2000 para no excedernos)
  let all = [];
  let lastId = undefined;
  const MAX_LOOPS = 20; // 20 * 100 = 2000
  for (let i = 0; i < MAX_LOOPS; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const arr = Array.from(batch.values());
    all = all.concat(arr);
    lastId = arr[arr.length - 1].id;
    if (batch.size < 100) break;
  }

  // ordenar por viejo->nuevo
  all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  let header =
    `Transcript del ticket: ${channel.name}\n` +
    `Cerrado por: ${closedByTag}\n` +
    `Fecha de cierre: ${new Date().toLocaleString("es-ES")}\n` +
    `--------------------------------------------\n`;

  let lines = [header];

  for (const msg of all) {
    const time = new Date(msg.createdTimestamp).toLocaleString("es-ES");
    const author = msg.author ? msg.author.tag : "Desconocido";
    let content = msg.content || "";
    // Adjuntos (links)
    if (msg.attachments && msg.attachments.size > 0) {
      const links = msg.attachments.map((a) => a.url).join(", ");
      content += (content ? " " : "") + `(Adjuntos: ${links})`;
    }
    lines.push(`[${time}] ${author}: ${content || "(sin mensaje)"}`);
  }

  return lines.join("\n");
}

// ---------------------------
// EVENTOS DE BIENVENIDA Y DESPEDIDA
// ---------------------------
client.on("guildMemberAdd", async (member) => {
  try {
    // Rol civil
    await member.roles.add(CIVIL_ROLE).catch(() => {});

    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
      const embed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("🎉 ¡Nuevo integrante!")
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setDescription(
          `Bienvenido/a ${member} a **Barra Venezuela** 🇻🇪\n\nYa se te asignó el rol de **Civil**.\n¡Esperamos que la pases genial! 🎈`
        )
        .addFields({
          name: "👥 Miembros totales",
          value: `${member.guild.memberCount}`,
        })
        .setFooter({ text: "Barra Venezuela - Sistema de Bienvenidas", iconURL: LOGO_URL });
      await welcomeChannel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.log("Error en bienvenida:", err);
  }
});

client.on("guildMemberRemove", async (member) => {
  try {
    const farewellChannel = member.guild.channels.cache.get(FAREWELL_CHANNEL_ID);
    if (farewellChannel) {
      const embed = new EmbedBuilder()
        .setColor("#e74c3c")
        .setTitle("👋 Miembro ha salido")
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setDescription(
          `**${member.user.tag}** abandonó **Barra Venezuela** 🥺\n\nEsperamos verlo de nuevo pronto.`
        )
        .addFields({
          name: "👥 Miembros restantes",
          value: `${member.guild.memberCount}`,
        })
        .setFooter({ text: "Barra Venezuela - Despedidas", iconURL: LOGO_URL });
      await farewellChannel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.log("Error en despedida:", err);
  }
});

// ---------------------------
// REGISTRO DE COMANDOS SLASH
// ---------------------------
const commands = [
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banea a un usuario del servidor")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario a banear").setRequired(true))
    .addStringOption((o) => o.setName("razon").setDescription("Razón del baneo")),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Desbanea a un usuario")
    .addStringOption((o) => o.setName("userid").setDescription("ID del usuario").setRequired(true))
    .addStringOption((o) => o.setName("razon").setDescription("Razón del desbaneo")),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa a un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario a expulsar").setRequired(true))
    .addStringOption((o) => o.setName("razon").setDescription("Razón del kick")),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Silencia (timeout) a un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario a mutear").setRequired(true))
    .addIntegerOption((o) => o.setName("minutos").setDescription("Duración en minutos").setRequired(true))
    .addStringOption((o) => o.setName("razon").setDescription("Razón del mute")),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Desmutea a un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario a desmutear").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sancionar")
    .setDescription("Aplica una sanción (warn/strike)")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario a sancionar").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("tipo")
        .setDescription("Tipo de sanción")
        .setRequired(true)
        .addChoices(
          { name: "1 Warn", value: "1434765219271409707" },
          { name: "2 Warn", value: "1434765234807242792" },
          { name: "1 Strike", value: "1434765238032531547" },
          { name: "2 Strike", value: "1434765239529902171" }
        )
    )
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo de la sanción").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Publica el panel de tickets (solo Jefe o Encargado)."),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Muestra todos los comandos disponibles"),
];

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Comandos registrados correctamente.");
  } catch (err) {
    console.log("Error registrando comandos:", err);
  }
})();

// ---------------------------
// MANEJO DE COMANDOS
// ---------------------------
client.on("interactionCreate", async (interaction) => {
  // Solo slash commands acá
  if (!interaction.isChatInputCommand()) return;

  // "Pensando…" para evitar Unknown interaction
  await interaction.deferReply({ ephemeral: false }).catch(() => {});

  try {
    const { commandName, member, options } = interaction;

    // Permisos (todos excepto /help requieren roles)
    if (commandName !== "help" && commandName !== "ticketpanel" && !ALLOWED_ROLES.some((r) => member.roles.cache.has(r))) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff5555)
            .setTitle("🚫 No tienes permiso para usar este comando.")
            .setFooter({ text: "Barra Venezuela - Sistema de Seguridad", iconURL: LOGO_URL }),
        ],
      });
    }

    const logEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📘 Registro de comando usado")
      .addFields(
        { name: "👤 Usuario", value: `${member.user.tag}`, inline: true },
        { name: "💬 Comando", value: `/${commandName}`, inline: true },
        { name: "🕒 Fecha", value: new Date().toLocaleString("es-ES") }
      )
      .setFooter({ text: "Barra Venezuela - Logs", iconURL: LOGO_URL });

    await sendGeneralLog(interaction, logEmbed);

    switch (commandName) {
      case "ban": {
        const target = options.getUser("usuario");
        const reason = options.getString("razon") || "Sin motivo especificado";
        const user = interaction.guild.members.cache.get(target.id);
        if (!user || !user.bannable) return interaction.editReply("No puedo banear a ese usuario.");
        await user.ban({ reason });
        await interaction.editReply(`🔨 ${target.tag} fue baneado por ${member}.`);
        break;
      }

      case "unban": {
        const userId = options.getString("userid");
        await interaction.guild.bans.remove(userId).catch(() => {});
        await interaction.editReply(`✅ Usuario con ID ${userId} fue desbaneado.`);
        break;
      }

      case "kick": {
        const target = options.getMember("usuario");
        const reason = options.getString("razon") || "Sin motivo especificado";
        if (!target || !target.kickable) return interaction.editReply("No puedo expulsar a ese usuario.");
        await target.kick(reason);
        await interaction.editReply(`👢 ${target.user.tag} fue expulsado.`);
        break;
      }

      case "mute": {
        const target = options.getMember("usuario");
        const minutes = options.getInteger("minutos");
        const reason = options.getString("razon") || "Sin motivo especificado";
        if (!target || !target.moderatable) return interaction.editReply("No puedo mutear a ese usuario.");
        await target.timeout(minutes * 60 * 1000, reason);
        await interaction.editReply(`🔇 ${target.user.tag} fue muteado por ${minutes} minutos.`);
        break;
      }

      case "unmute": {
        const target = options.getMember("usuario");
        if (!target || !target.isCommunicationDisabled())
          return interaction.editReply("Ese usuario no está muteado.");
        await target.timeout(null);
        await interaction.editReply(`🔊 ${target.user.tag} fue desmuteado.`);
        break;
      }

      case "sancionar": {
        const target = options.getMember("usuario");
        const tipoRol = options.getString("tipo");
        const motivo = options.getString("motivo");
        const rolesWarnStrike = [
          "1434765219271409707",
          "1434765234807242792",
          "1434765238032531547",
          "1434765239529902171",
        ];
        for (const r of rolesWarnStrike) {
          if (target.roles.cache.has(r)) await target.roles.remove(r);
        }
        await target.roles.add(tipoRol).catch(() => {});
        const tipoTexto = {
          "1434765219271409707": "⚠️ 1 Warn",
          "1434765234807242792": "⚠️ 2 Warns",
          "1434765238032531547": "❌ 1 Strike",
          "1434765239529902171": "❌ 2 Strikes",
        }[tipoRol];
        const embed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("🚨 Sanción Aplicada")
          .addFields(
            { name: "👤 Usuario", value: `${target}`, inline: true },
            { name: "🛠️ Moderador", value: `${member}`, inline: true },
            { name: "📄 Tipo", value: tipoTexto, inline: false },
            { name: "📝 Motivo", value: motivo, inline: false }
          )
          .setThumbnail(LOGO_URL)
          .setFooter({ text: "Barra Venezuela - Sistema Disciplinario", iconURL: LOGO_URL });
        const logChannel = interaction.guild.channels.cache.get(SANCTION_LOG_CHANNEL);
        if (logChannel) await logChannel.send({ embeds: [embed] });
        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case "ticketpanel": {
        // Solo Jefe/Encargado
        if (!isStaff(member)) {
          return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xff5555).setTitle("🚫 No tienes permiso para publicar el panel.")],
          });
        }

        const panelEmbed = new EmbedBuilder()
          .setTitle("🎫 Tickets - Dudas")
          .setDescription("Presioná el botón para abrir un ticket de **Dudas**. Un **Jefe o Encargado** te atenderá.")
          .setColor(0x5865f2)
          .setFooter({ text: "Barra Venezuela - Sistema de Tickets", iconURL: LOGO_URL });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("open_ticket_dudas").setLabel("📩 Dudas").setStyle(ButtonStyle.Primary)
        );

        // Canal destino (el del .env, o el actual de la interacción si no hay)
        const targetChannel =
          interaction.guild.channels.cache.get(TICKET_PANEL_CHANNEL_ID) || interaction.channel;

        await targetChannel.send({ embeds: [panelEmbed], components: [row] }).catch(() => {});
        await interaction.editReply({ content: "✅ Panel publicado.", embeds: [] });
        break;
      }

      case "help": {
        const embed = new EmbedBuilder()
          .setColor(0x2f3136)
          .setTitle("📜 Comandos Disponibles")
          .setDescription(
            [
              "🔨 `/ban` — Banear usuario",
              "✅ `/unban` — Desbanear usuario",
              "👢 `/kick` — Expulsar usuario",
              "🔇 `/mute` — Silenciar usuario",
              "🔊 `/unmute` — Desmutear usuario",
              "🚨 `/sancionar` — Aplicar sanción con rol",
              "🎫 `/ticketpanel` — Publicar panel de tickets (Dudas)",
            ].join("\n")
          )
          .setFooter({ text: "Barra Venezuela - Bot Moderación", iconURL: LOGO_URL });
        await interaction.editReply({ embeds: [embed] });
        break;
      }

      default:
        await interaction.editReply("❌ Acción desconocida.");
        break;
    }
  } catch (err) {
    console.error("💥 Error general:", err);
  }
});

// ---------------------------
// BOTONES DE TICKETS
// ---------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, member, guild, channel } = interaction;

  // Para evitar Unknown interaction
  await interaction.deferUpdate().catch(() => {});

  try {
    if (customId === "open_ticket_dudas") {
      // Un ticket por usuario
      const existing = guild.channels.cache.find(
        (c) => c.topic === `ticket_owner:${member.id}`
      );
      if (existing) {
        await interaction.followUp({ content: `Ya tienes un ticket abierto: ${existing}`, ephemeral: true }).catch(() => {});
        return;
      }

      const usernameClean = member.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "");
      const channelName = `ticket-dudas-${usernameClean}`.slice(0, 90);

      const channelData = {
        name: channelName,
        type: 0, // GUILD_TEXT
        parent: TICKET_CATEGORY_ID || undefined,
        topic: `ticket_owner:${member.id}`,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.AttachFiles,
            ],
          },
          ...ALLOWED_ROLES.map((id) => ({
            id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageMessages,
            ],
          })),
        ],
      };

      const newChannel = await guild.channels.create(channelData);

      const ticketEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🎫 Ticket - Dudas")
        .setDescription(`Hola ${member}, explicá tu duda y un **Jefe o Encargado** te atenderá a la brevedad.`)
        .addFields({ name: "Usuario", value: `${member}`, inline: true })
        .setFooter({ text: "Barra Venezuela - Tickets", iconURL: LOGO_URL });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close_ticket").setLabel("🗑️ Cerrar").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("claim_ticket").setLabel("🎟️ Asumir Ticket").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("notify_user").setLabel("📣 Notificar Usuario").setStyle(ButtonStyle.Secondary)
      );

      await newChannel.send({
        content: `${ALLOWED_ROLES.map((id) => `<@&${id}>`).join(" ")}`,
        embeds: [ticketEmbed],
        components: [row],
      });

      await interaction.followUp({ content: `✅ Ticket creado: ${newChannel}`, ephemeral: true }).catch(() => {});
      return;
    }

    // Acciones internas del ticket (solo staff)
    if (["close_ticket", "claim_ticket", "notify_user"].includes(customId)) {
      if (!isStaff(member)) {
        await interaction.followUp({ content: "🚫 No tienes permiso para usar este botón.", ephemeral: true }).catch(() => {});
        return;
      }

      if (customId === "claim_ticket") {
        await channel.send(`🎟️ Ticket asumido por ${member}`).catch(() => {});
        return;
      }

      if (customId === "notify_user") {
        const topic = channel.topic || "";
        const match = topic.match(/ticket_owner:(\d+)/);
        const ownerId = match ? match[1] : null;
        if (!ownerId) {
          await channel.send("⚠️ No se pudo encontrar al dueño del ticket.").catch(() => {});
          return;
        }
        await channel.send({ content: `<@${ownerId}> 📣 Por favor respondé a este ticket cuando puedas.` }).catch(() => {});
        await interaction.followUp({ content: "✅ Usuario notificado.", ephemeral: true }).catch(() => {});
        return;
      }

      if (customId === "close_ticket") {
        try {
          await channel.send("🧾 Generando transcript...").catch(() => {});
          const transcriptText = await buildTranscriptTXT(channel, member.user.tag);
          const filePath = `./${channel.name}-${Date.now()}-transcript.txt`;
          fs.writeFileSync(filePath, transcriptText);

          const logChannel = guild.channels.cache.get(TICKET_LOG_CHANNEL);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor("#2ecc71")
              .setTitle("🧾 Ticket cerrado")
              .setDescription(`Ticket: **${channel.name}**\nCerrado por: ${member}`)
              .setFooter({ text: "Barra Venezuela - Transcripts", iconURL: LOGO_URL });
            await logChannel.send({ embeds: [embed], files: [filePath] }).catch(() => {});
          }

          try { fs.unlinkSync(filePath); } catch (_) {}

          await channel.send("🗑️ Ticket cerrado. Borrando canal en 5 segundos...").catch(() => {});
          setTimeout(() => channel.delete().catch(() => {}), 5000);
        } catch (e) {
          console.log("Error generando transcript:", e);
          await channel.send("❌ Error al generar transcript.").catch(() => {});
        }
        return;
      }
    }
  } catch (err) {
    console.error("❌ Error en interacción de botón:", err);
  }
});

// ---------------------------
// LOGIN
// ---------------------------
client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});
client.login(TOKEN);
