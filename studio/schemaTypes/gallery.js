import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'gallery',
  title: 'Galería de imágenes',
  type: 'object',
  fields: [
    defineField({
      name: 'layout',
      title: 'Diseño',
      type: 'string',
      initialValue: 'grid',
      options: {
        list: [
          {title: 'Grid (cuadrícula)', value: 'grid'},
          {title: 'Carousel (slider horizontal)', value: 'carousel'},
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'images',
      title: 'Imágenes',
      type: 'array',
      validation: (Rule) => Rule.min(2).error('Una galería necesita al menos 2 imágenes'),
      of: [
        {
          type: 'image',
          options: {hotspot: true},
          fields: [
            {name: 'alt', type: 'string', title: 'Texto alternativo'},
            {name: 'caption', type: 'string', title: 'Pie de imagen'},
            {name: 'credit', type: 'string', title: 'Crédito / fuente'},
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {images: 'images', layout: 'layout'},
    prepare({images, layout}) {
      const count = images?.length || 0
      return {
        title: `Galería (${count} imagen${count === 1 ? '' : 'es'})`,
        subtitle: layout === 'carousel' ? 'Carousel' : 'Grid',
        media: images?.[0],
      }
    },
  },
})
