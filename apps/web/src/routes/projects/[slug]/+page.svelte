<script lang="ts">
  import ProjectDetail from '$lib/views/ProjectDetail.svelte';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
  const project = $derived(data.project);
</script>

<Seo
  title={(project.seo_title || project.title) + ' | Voidreg'}
  description={project.seo_description || project.summary}
  image={project.social_image || project.hero_image}
  structured={{
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.title,
    description: project.summary,
    url: 'https://www.voidreg.xyz/projects/' + project.slug
  }}
/>
<ProjectDetail {project} posts={data.posts} />
