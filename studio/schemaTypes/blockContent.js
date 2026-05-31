import {defineType, defineArrayMember} from 'sanity'

export default defineType({
  title: 'Block Content',
  name: 'blockContent',
  type: 'array',
  of: [
    defineArrayMember({
      title: 'Block',
      type: 'block',
      styles: [
        {title: 'Normal', value: 'normal'},
        {title: 'H1', value: 'h1'},
        {title: 'H2', value: 'h2'},
        {title: 'H3', value: 'h3'},
        {title: 'H4', value: 'h4'},
        {title: 'Lead (intro grande)', value: 'lead'},
        {title: 'Quote', value: 'blockquote'},
        {title: 'Pull quote (cita destacada)', value: 'pullquote'},
      ],
      lists: [
        {title: 'Bullet', value: 'bullet'},
        {title: 'Numbered', value: 'number'},
      ],
      marks: {
        decorators: [
          {title: 'Strong', value: 'strong'},
          {title: 'Emphasis', value: 'em'},
          {title: 'Underline', value: 'underline'},
          {title: 'Strike-through', value: 'strike-through'},
          {title: 'Highlight', value: 'highlight'},
          {title: 'Code', value: 'code'},
        ],
        annotations: [
          {
            title: 'URL externa',
            name: 'link',
            type: 'object',
            fields: [
              {
                title: 'URL',
                name: 'href',
                type: 'url',
                validation: (Rule) => Rule.uri({scheme: ['http', 'https', 'mailto', 'tel']}),
              },
              {
                title: 'Abrir en nueva pestaña',
                name: 'blank',
                type: 'boolean',
                initialValue: true,
              },
            ],
          },
          {
            title: 'Link a otro post',
            name: 'internalLink',
            type: 'object',
            fields: [
              {
                name: 'reference',
                type: 'reference',
                title: 'Post',
                to: [{type: 'post'}],
              },
            ],
          },
        ],
      },
    }),

    defineArrayMember({
      type: 'image',
      options: {hotspot: true},
      fields: [
        {
          name: 'alt',
          title: 'Texto alternativo',
          type: 'string',
          description: 'Descripción de la imagen para accesibilidad y SEO',
        },
        {
          name: 'caption',
          title: 'Pie de imagen',
          type: 'string',
          description: 'Opcional. Aparece en cursiva debajo de la imagen.',
        },
        {
          name: 'credit',
          title: 'Crédito / fuente',
          type: 'string',
          description: 'Opcional. Ej: "Foto: AFP / Getty Images"',
        },
        {
          name: 'size',
          title: 'Tamaño',
          type: 'string',
          initialValue: 'full',
          options: {
            list: [
              {title: 'Pequeña (40%)', value: 'small'},
              {title: 'Mediana (70%)', value: 'medium'},
              {title: 'Completa (100%)', value: 'full'},
            ],
            layout: 'radio',
          },
        },
      ],
    }),

    defineArrayMember({type: 'callout'}),
    defineArrayMember({type: 'gallery'}),

    defineArrayMember({
      name: 'divider',
      title: 'Divisor (línea horizontal)',
      type: 'object',
      fields: [
        {
          name: 'style',
          title: 'Estilo',
          type: 'string',
          initialValue: 'line',
          options: {
            list: [
              {title: 'Línea simple', value: 'line'},
              {title: 'Puntos · · ·', value: 'dots'},
              {title: 'Asteriscos ✦ ✦ ✦', value: 'asterisks'},
            ],
            layout: 'radio',
          },
        },
      ],
      preview: {prepare: () => ({title: '— — — Divisor — — —'})},
    }),

    defineArrayMember({
      name: 'ctaButton',
      title: 'Botón CTA',
      type: 'object',
      fields: [
        {
          name: 'label',
          title: 'Texto del botón',
          type: 'string',
          validation: (Rule) => Rule.required(),
        },
        {
          name: 'href',
          title: 'URL de destino',
          type: 'url',
          validation: (Rule) =>
            Rule.required().uri({scheme: ['http', 'https', 'mailto', 'tel']}),
        },
        {
          name: 'style',
          title: 'Estilo',
          type: 'string',
          initialValue: 'primary',
          options: {
            list: [
              {title: 'Primario (relleno)', value: 'primary'},
              {title: 'Secundario (borde)', value: 'secondary'},
            ],
            layout: 'radio',
          },
        },
        {
          name: 'blank',
          title: 'Abrir en nueva pestaña',
          type: 'boolean',
          initialValue: true,
        },
      ],
      preview: {
        select: {title: 'label', subtitle: 'href'},
      },
    }),

    defineArrayMember({
      name: 'youtubeEmbed',
      title: 'Video de YouTube',
      type: 'object',
      fields: [
        {
          name: 'url',
          title: 'URL del video',
          type: 'url',
          description: 'Pega la URL completa, ej: https://www.youtube.com/watch?v=...',
          validation: (Rule) => Rule.required(),
        },
        {
          name: 'caption',
          title: 'Pie / descripción',
          type: 'string',
        },
      ],
      preview: {
        select: {url: 'url', caption: 'caption'},
        prepare: ({url, caption}) => ({title: caption || 'YouTube', subtitle: url}),
      },
    }),

    defineArrayMember({
      name: 'vimeoEmbed',
      title: 'Video de Vimeo',
      type: 'object',
      fields: [
        {
          name: 'url',
          title: 'URL del video',
          type: 'url',
          description: 'Pega la URL completa, ej: https://vimeo.com/123456789',
          validation: (Rule) => Rule.required(),
        },
        {
          name: 'caption',
          title: 'Pie / descripción',
          type: 'string',
        },
      ],
      preview: {
        select: {url: 'url', caption: 'caption'},
        prepare: ({url, caption}) => ({title: caption || 'Vimeo', subtitle: url}),
      },
    }),

    defineArrayMember({
      name: 'tweetEmbed',
      title: 'Tweet / Post de X',
      type: 'object',
      fields: [
        {
          name: 'url',
          title: 'URL del tweet',
          type: 'url',
          description: 'URL completa del tweet, ej: https://twitter.com/usuario/status/1234567890',
          validation: (Rule) => Rule.required(),
        },
      ],
      preview: {
        select: {url: 'url'},
        prepare: ({url}) => ({title: 'Tweet', subtitle: url}),
      },
    }),

    defineArrayMember({
      name: 'iframeEmbed',
      title: 'Embed genérico (iframe)',
      type: 'object',
      description: 'Para Spotify, SoundCloud, CodePen, Google Maps, etc.',
      fields: [
        {
          name: 'url',
          title: 'URL del embed',
          type: 'url',
          description: 'La URL del iframe (no la página entera). Mira la opción "Embed" / "Compartir" en la fuente.',
          validation: (Rule) => Rule.required(),
        },
        {
          name: 'aspectRatio',
          title: 'Proporción',
          type: 'string',
          initialValue: '16:9',
          options: {
            list: [
              {title: '16:9 (video)', value: '16:9'},
              {title: '4:3', value: '4:3'},
              {title: '1:1 (cuadrado)', value: '1:1'},
              {title: '9:16 (vertical)', value: '9:16'},
              {title: 'Altura fija 152px (Spotify)', value: 'spotify'},
              {title: 'Altura fija 400px', value: 'tall'},
            ],
          },
        },
        {
          name: 'caption',
          title: 'Pie / descripción',
          type: 'string',
        },
      ],
      preview: {
        select: {url: 'url', caption: 'caption'},
        prepare: ({url, caption}) => ({title: caption || 'Embed', subtitle: url}),
      },
    }),
  ],
})
