const OpenAI = require('openai').default;
require('dotenv').config();

const openai = new OpenAI({
                apiKey: process.env.PAUL_API_KEY,
            });

const messages = [
    { role: "system", content: "You are Paul and you are observing a social media website." },
    { role: "assistant", content: "Hey, I'm Paul and I'm observing a social media website." },
    { role: "user", content: `The following is the Public Timeline:\n Post ID: 111496378697836796\nUsername: jamiesmom\nContent: Unions are the backbone of the working class! Big corps exploit us every day. We need total police reform NOW. Dems aint great but theyre all we got. #WorkersUnite #NoJusticeNoPeace\nReplies Count: 2`},
    { role: "user", content: "Can you write a Post or select a Post to reply to?"},
];

function getPublicTimeline() {
    console.log("viewed Public Timeline");
    return 'Post ID: 111496378697836796\nUsername: jamiesmom\nContent: Unions are the backbone of the working class! Big corps exploit us every day. We need total police reform NOW. Dems aint great but theyre all we got. #WorkersUnite #NoJusticeNoPeace\nReplies Count: 2';
}

function setStatus(content) {
    console.log(content);
    return `Paul posted ${content}`;
}

function getStatusThread(statusID) {
    console.log(statusID);
    if (statusID == 111496378697836796) {
        return 'Post ID: 111496378623809036\nUsername: martha\nContent: Just overheard Tanner debate the school dress code like a mini lawyer! Strong moms raise strong kids who stand up for what they believe. #MomPride #RaisingLeaders Am I right? 😊👩‍👦💪🏼\nReplies Count: 0\n\nPost ID: 111496378534852277\nUsername: kennedy\nContent: The systems rigged, mi gente! Just walked outta the voting booth. Threw my punch for the underdog. No sellouts. #ResistTheMainstream #PowerToThePeople ✊🏽💥\nReplies Count: 1';
    }
}

async function runConversation() {
// Step 1: send the conversation and available functions to the model
    const tools = [
        {
        type: "function",
        function: {
            name: "set_post",
            description: "Write a post for a social media website.",
            parameters: {
                type: "object",
                properties: {
                    content: {
                    type: "string",
                    description: "Content of the post.",
                    },
                },
                required: ["content"],
            },
        },
        },
        {
            type: "function",
            function: {
                name: "get_post_thread",
                description: "Get a thread for a selected post to reply to.",
                parameters: {
                    type: "object",
                    properties: {
                        statusID: {
                        type: "string",
                        description: "Post ID",
                        },
                    },
                    required: ["statusID"],
                },
            },
            },
    ];


    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-1106",
        messages: messages,
        tools: tools,
        tool_choice: "auto", // auto is default, but we'll be explicit
    });
    const responseMessage = response.choices[0].message;

    // Step 2: check if the model wanted to call a function
    const toolCalls = responseMessage.tool_calls;
    if (responseMessage.tool_calls) {
        // Step 3: call the function
        // Note: the JSON response may not always be valid; be sure to handle errors
        const availableFunctions = {
            set_post: setStatus,
            get_post_thread: getStatusThread,
        }; // only one function in this example, but you can have multiple
        messages.push(responseMessage); // extend conversation with assistant's reply
        for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;
            const functionToCall = availableFunctions[functionName];
            const functionArgs = JSON.parse(toolCall.function.arguments);

            let functionResponse;
            switch (functionName) {
                case 'set_post':
                    functionResponse = functionToCall(functionArgs.content);
                    break;
                case 'get_post_thread':
                    functionResponse = functionToCall(functionArgs.statusID);
                    break;
            }

            messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: functionName,
                content: functionResponse,
            }); // extend conversation with function response
        }
        const secondResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-1106",
            messages: messages,
        }); // get a new response from the model where it can see the function response
        return secondResponse.choices;
    }
}

runConversation().then(console.log).catch(console.error);
