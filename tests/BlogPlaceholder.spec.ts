import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { BlogPlaceholder } from '../src'

describe('BlogPlaceholder', () => {
  it('is exported from the package entry point', () => {
    expect(BlogPlaceholder).toBeTruthy()
  })

  it('mounts and renders the placeholder message', () => {
    const wrapper = mount(BlogPlaceholder)
    expect(wrapper.find('[data-testid="blog-placeholder"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Blog component placeholder')
  })

  it('renders the default title and accepts a title prop', () => {
    const def = mount(BlogPlaceholder)
    expect(def.text()).toContain('blog-component')

    const custom = mount(BlogPlaceholder, { props: { title: 'My Blog' } })
    expect(custom.text()).toContain('My Blog')
  })
})
