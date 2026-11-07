<script lang="ts">
  import ProjectDetail from '$lib/views/ProjectDetail.svelte';
  import Seo from '$lib/Seo.svelte';
  import { absolute, author, breadcrumbs, describe, graph, pageTitle } from '$lib/seo';
  let { data } = $props();
  const project = $derived(data.project);
</script>

<Seo
  title={pageTitle(project.seo_title || project.title)}
  description={describe(project.seo_description, project.summary)}
  image={project.social_image || project.hero_image}
  imageAlt={project.hero_alt}
  markdown={'/projects/' + project.slug + '.md'}
  structured={graph([
    {
      '@type': project.repo_url ? 'SoftwareSourceCode' : 'CreativeWork',
      name: project.title,
      description: describe(project.seo_description, project.summary),
      url: absolute('/projects/' + project.slug),
      image:
        project.social_image || project.hero_image
          ? [absolute(project.social_image || project.hero_image || '')]
          : undefined,
      dateModified: project.updated_at,
      keywords: project.tags?.length ? project.tags.join(', ') : undefined,
      genre: project.category,
      codeRepository: project.repo_url || undefined,
      inLanguage: 'en',
      author,
      creator: author
    },
    breadcrumbs([
      { name: 'Home', path: '/' },
      { name: 'Projects', path: '/projects' },
      { name: project.title, path: '/projects/' + project.slug }
    ])
  ])}
/>
<ProjectDetail {project} log={data.log} />
