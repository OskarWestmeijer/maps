<script lang="ts">
	// One row of a panel's stat table: a narrow uppercase label, a wide-set figure. The
	// width-axis pairing (88% stretch label against 112% figure) is what makes the panel read
	// as a statistical table rather than a stack of form rows.
	let { label, value }: { label: string; value: string } = $props();
</script>

<div class="flex items-baseline justify-between gap-3 py-1.5">
	<span class="stat-label">{label}</span>
	<span class="display-wide text-base font-semibold">{value}</span>
</div>
