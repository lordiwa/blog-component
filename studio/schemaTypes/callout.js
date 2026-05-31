import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'callout',
  title: 'Callout / Caja destacada',
  type: 'object',
  fields: [
    defineField({
      name: 'tone',
      title: 'Tono',
      type: 'string',
      initialValue: 'info',
      options: {
        list: [
          {title: 'Información (azul)', value: 'info'},
          {title: 'Aviso (amarillo)', value: 'warn'},
          {title: 'Destacado (blanco)', value: 'highlight'},
          {title: 'Cita / Nota del editor', value: 'note'},
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'title',
      title: 'Título',
      type: 'string',
      description: 'Opcional. Aparece en negrita arriba del contenido.',
    }),
    defineField({
      name: 'body',
      title: 'Contenido',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [{title: 'Normal', value: 'normal'}],
          lists: [{title: 'Bullet', value: 'bullet'}],
          marks: {
            decorators: [
              {title: 'Strong', value: 'strong'},
              {title: 'Emphasis', value: 'em'},
            ],
            annotations: [
              {
                name: 'link',
                type: 'object',
                title: 'URL',
                fields: [{name: 'href', type: 'url', title: 'URL'}],
              },
            ],
          },
        },
      ],
    }),
  ],
  preview: {
    select: {title: 'title', tone: 'tone'},
    prepare({title, tone}) {
      return {
        title: title || 'Callout',
        subtitle: tone ? `Tono: ${tone}` : '',
      }
    },
  },
})
