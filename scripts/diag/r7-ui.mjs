console.log('====================================================');
console.log('  R7: UI RENDERING & INCONSISTENCY AUDIT');
console.log('====================================================\n');

// Document all 5 UI state divergence issues discovered:
console.log('Finding 1: Status Divergence');
console.log(' - TopBar renders: activeStatus === "thinking" ? "Reasoning..." : "Executing Tool..."');
console.log(' - StatusBar renders: activeRole ? `${activeRole} (${activeStatus})` : "Agent: Ready" -> "Coordinator (Thinking)"');
console.log(' - PipelineCard renders: isRunning ? "Executing..." : "Done"');
console.log('Cause: Multiple components deriving independent display labels from divergent local states.\n');

console.log('Finding 2: Model Name Divergence');
console.log(' - TopBar renders: primaryProvider.defaultModel || primaryProvider.name (default "gpt-4o")');
console.log(' - ChatScreen Header renders: activeTask.providerMetadata?.model (e.g. "o1-mini")');
console.log(' - ChatScreen Composer renders: selectedModel (e.g. "o1-mini")');
console.log('Cause: TopBar ignores active task or composer selection and renders static primaryProvider default.\n');

console.log('Finding 3: Fake/Cumulative Token Counter in StatusBar');
console.log(' - StatusBar receives: totalTokens={usageSummary?.totalTokens || 0}');
console.log(' - usageSummary is the all-time lifetime sum of all 98 test records in ~/.nexus_ai/NEXUS_AI_DATA/usage.json');
console.log(' - Brand-new tasks thus display "207,900 tokens (~$0.6807)" immediately on screen!\n');

console.log('Finding 4: Coordinator Card Shows "Done" on Failed Tasks');
console.log(' - ChatScreen lines 174-178: activeTask ? "completed" : "waiting"');
console.log(' - When a task fails, activeTask exists, so it evaluates to "completed" with a green checkmark!\n');

console.log('Finding 5: Error Panel Missing on Task Failure');
console.log(' - ChatScreen never renders activeTask.error.');
console.log(' - On task_failed, setActiveTaskId(null) is called in App.tsx, clearing activeTaskId.');
console.log(' - User is left with no error explanation, disabled composer, and a misleading Done checkmark.\n');
