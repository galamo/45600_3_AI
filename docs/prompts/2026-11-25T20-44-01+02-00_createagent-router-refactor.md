# createagent router refactor

- **timestamp**: 2026-11-25T20:44:01+02:00
- **summary**: createagent router refactor

## Prompt

instead of using the CreaetModel with bind tools 
user CreateAgent Api of lanchain and apply the relevant tools into the agent. 
const model = createModel().bindTools(tools);@lab_09_b/server/agents/router-agent.js 
also try to improve the system prompt accrding to the new agent capabilities
