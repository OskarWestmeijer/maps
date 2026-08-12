<script lang="ts">
	// One row of a panel's stat table: a narrow uppercase label, a wide-set figure. The
	// width-axis pairing (88% stretch label against 112% figure) is what makes the panel read
	// as a statistical table rather than a stack of form rows.
	//
	// `hint` is for the rows whose *label* can't carry the meaning on its own — a measure with
	// an arbitrary scale (Gini), or a figure that looks like a familiar one but isn't (household
	// population against väkiluku). It renders as a line under the row rather than a tooltip, so
	// it's readable without hovering and on a phone; it costs vertical space, which is why it's
	// opt-in per row rather than the default. `fits-one-screen.spec.ts` is what catches it if a
	// panel grows past its column.
	let { label, value, hint }: { label: string; value: string; hint?: string } = $props();
</script>

<div class="py-1.5">
	<div class="flex items-baseline justify-between gap-3">
		<span class="stat-label">{label}</span>
		<span class="display-wide text-base font-semibold">{value}</span>
	</div>

	{#if hint}
		<p class="mt-0.5 text-xs leading-snug" style:color="var(--ink-faint)">{hint}</p>
	{/if}
</div>
