/**
 * Starter templates for common document types. Content uses only what the editor supports
 * (headings, lists and list styles, checklists, quotes, code cells, page breaks) and is sanitized by the
 * server like any other content. Placeholders are in [square brackets] so they are easy to spot.
 */

export interface Template {
  id: string;
  name: string;
  category: 'Personal' | 'Work' | 'Engineering' | 'Education';
  description: string;
  accent: string;
  title: string;
  content: string;
}

/** Joins the template markup, removing layout whitespace between tags but never inside code blocks. */
const html = (strings: TemplateStringsArray) =>
  strings
    .join('')
    .split(/(<pre>[\s\S]*?<\/pre>)/)
    .map((part, i) => (i % 2 ? part : part.replace(/\n\s*/g, '')))
    .join('');

export const TEMPLATES: Template[] = [
  {
    id: 'resume',
    name: 'Resume',
    category: 'Personal',
    description: 'One-page resume with summary, experience and skills',
    accent: '#001d6b',
    title: 'Resume – [Your Name]',
    content: html`
      <h1>[Your Name]</h1>
      <p>[Job title] · [City, Country] · [email@example.com] · [+00 00000 00000] · [linkedin.com/in/you]</p>
      <hr>
      <h2>Summary</h2>
      <p>[Two or three sentences on who you are, what you are best at and the kind of role you want next.]</p>
      <h2>Experience</h2>
      <h3>[Job title] — [Company]</h3>
      <p><em>[Month Year] – Present · [City]</em></p>
      <ul data-list-style="arrow">
        <li><p>[Achievement with a measurable result, e.g. "Cut report generation time by 40% by …"]</p></li>
        <li><p>[Project you led and its impact]</p></li>
        <li><p>[Tools or methods you introduced]</p></li>
      </ul>
      <h3>[Previous job title] — [Company]</h3>
      <p><em>[Month Year] – [Month Year] · [City]</em></p>
      <ul data-list-style="arrow">
        <li><p>[Achievement]</p></li>
        <li><p>[Achievement]</p></li>
      </ul>
      <h2>Education</h2>
      <p><strong>[Degree], [Field]</strong> — [University], [Year]</p>
      <h2>Skills</h2>
      <ul data-list-style="square">
        <li><p><strong>Languages:</strong> [Python, SQL, TypeScript]</p></li>
        <li><p><strong>Tools:</strong> [Git, Docker, AWS]</p></li>
        <li><p><strong>Strengths:</strong> [Communication, mentoring, problem solving]</p></li>
      </ul>`,
  },
  {
    id: 'cover-letter',
    name: 'Cover letter',
    category: 'Personal',
    description: 'A focused letter to pair with a job application',
    accent: '#0a2a86',
    title: 'Cover letter – [Company]',
    content: html`
      <p><strong>[Your Name]</strong><br>[email@example.com] · [+00 00000 00000]<br>[Date]</p>
      <p>[Hiring Manager Name]<br>[Company]<br>[Company address]</p>
      <p>Dear [Hiring Manager Name],</p>
      <p>I am writing to apply for the <strong>[Role]</strong> position at [Company]. [One sentence on why this company and this role interest you.]</p>
      <p>In my current role at [Current Company], I [describe your most relevant achievement and its result]. This experience has prepared me to [how you would contribute in the new role].</p>
      <p>What draws me to [Company] is [something specific: product, mission, team, recent news]. I would bring:</p>
      <ul>
        <li><p>[Strength 1, with a short example]</p></li>
        <li><p>[Strength 2, with a short example]</p></li>
        <li><p>[Strength 3, with a short example]</p></li>
      </ul>
      <p>Thank you for considering my application. I would welcome the chance to discuss how I can help [Company] [goal].</p>
      <p>Sincerely,<br>[Your Name]</p>`,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    category: 'Work',
    description: 'Agenda, decisions and action items with owners',
    accent: '#1f6bff',
    title: 'Meeting notes – [Topic] – [Date]',
    content: html`
      <h1>[Meeting topic]</h1>
      <p><strong>Date:</strong> [Date] · <strong>Time:</strong> [Time] · <strong>Facilitator:</strong> [Name]</p>
      <p><strong>Attendees:</strong> [Name], [Name], [Name]</p>
      <h2>Agenda</h2>
      <ol>
        <li><p>[Topic 1]</p></li>
        <li><p>[Topic 2]</p></li>
        <li><p>[Topic 3]</p></li>
      </ol>
      <h2>Notes</h2>
      <ul>
        <li><p>[Key point discussed]</p></li>
        <li><p>[Key point discussed]</p></li>
      </ul>
      <h2>Decisions</h2>
      <ul data-list-style="check">
        <li><p>[Decision and the reason for it]</p></li>
      </ul>
      <h2>Action items</h2>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false"><p>[Action] — <strong>[Owner]</strong> by [date]</p></li>
        <li data-type="taskItem" data-checked="false"><p>[Action] — <strong>[Owner]</strong> by [date]</p></li>
        <li data-type="taskItem" data-checked="false"><p>[Action] — <strong>[Owner]</strong> by [date]</p></li>
      </ul>
      <h2>Next meeting</h2>
      <p>[Date and time] — [Topics to carry over]</p>`,
  },
  {
    id: 'project-proposal',
    name: 'Project proposal',
    category: 'Work',
    description: 'Problem, solution, scope, timeline and budget',
    accent: '#6ea4e6',
    title: 'Project proposal – [Project name]',
    content: html`
      <h1>[Project name]</h1>
      <p><em>Prepared by [Name] for [Audience] · [Date]</em></p>
      <h2>1. Overview</h2>
      <p>[A short paragraph a busy reader can understand on its own: what you propose and why now.]</p>
      <h2>2. Problem</h2>
      <p>[Who is affected, how often, and what it costs today. Include a number if you have one.]</p>
      <blockquote><p>"[A quote from a customer or stakeholder that captures the problem.]"</p></blockquote>
      <h2>3. Proposed solution</h2>
      <p>[What you will build or change, and how it solves the problem.]</p>
      <h2>4. Goals and success metrics</h2>
      <ul data-list-style="arrow">
        <li><p>[Goal] — measured by [metric] reaching [target] by [date]</p></li>
        <li><p>[Goal] — measured by [metric]</p></li>
      </ul>
      <h2>5. Scope</h2>
      <p><strong>In scope:</strong> [items]</p>
      <p><strong>Out of scope:</strong> [items]</p>
      <h2>6. Timeline</h2>
      <ol data-list-style="upper-roman">
        <li><p><strong>Discovery</strong> — [dates]</p></li>
        <li><p><strong>Build</strong> — [dates]</p></li>
        <li><p><strong>Launch and review</strong> — [dates]</p></li>
      </ol>
      <h2>7. Budget and resources</h2>
      <p>[People, tools and costs needed.]</p>
      <h2>8. Risks</h2>
      <ul>
        <li><p>[Risk] — [mitigation]</p></li>
      </ul>`,
  },
  {
    id: 'prd',
    name: 'Product requirements',
    category: 'Work',
    description: 'PRD with user stories, requirements and open questions',
    accent: '#7b5cff',
    title: 'PRD – [Feature name]',
    content: html`
      <h1>[Feature name] — Product requirements</h1>
      <p><strong>Owner:</strong> [PM] · <strong>Status:</strong> Draft · <strong>Target release:</strong> [Version / date]</p>
      <h2>Background</h2>
      <p>[Context and the customer problem. Link research or data.]</p>
      <h2>Goals</h2>
      <ul data-list-style="check">
        <li><p>[Outcome for users]</p></li>
        <li><p>[Outcome for the business]</p></li>
      </ul>
      <h2>Non-goals</h2>
      <ul data-list-style="dash">
        <li><p>[What this release deliberately will not do]</p></li>
      </ul>
      <h2>User stories</h2>
      <ol>
        <li><p>As a [type of user], I want to [action] so that [benefit].</p></li>
        <li><p>As a [type of user], I want to [action] so that [benefit].</p></li>
      </ol>
      <h2>Requirements</h2>
      <h3>Must have</h3>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false"><p>[Requirement]</p></li>
        <li data-type="taskItem" data-checked="false"><p>[Requirement]</p></li>
      </ul>
      <h3>Nice to have</h3>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false"><p>[Requirement]</p></li>
      </ul>
      <h2>Success metrics</h2>
      <p>[Metric, baseline and target.]</p>
      <h2>Open questions</h2>
      <ul>
        <li><p>[Question] — [who will answer, by when]</p></li>
      </ul>`,
  },
  {
    id: 'tech-design',
    name: 'Technical design',
    category: 'Engineering',
    description: 'Design doc with architecture, API and rollout plan',
    accent: '#0d1526',
    title: 'Design doc – [System or feature]',
    content: html`
      <h1>[System or feature] — Technical design</h1>
      <p><strong>Author:</strong> [Name] · <strong>Reviewers:</strong> [Names] · <strong>Status:</strong> In review</p>
      <h2>Context</h2>
      <p>[What exists today and why a change is needed.]</p>
      <h2>Goals and non-goals</h2>
      <ul data-list-style="check"><li><p>[Goal]</p></li></ul>
      <ul data-list-style="dash"><li><p>[Non-goal]</p></li></ul>
      <h2>Proposed design</h2>
      <p>[Components, data flow and responsibilities.]</p>
      <h3>API</h3>
      <pre><code class="language-python">@app.post("/v1/[resource]")
def create_resource(body: CreateResource, user: User = Depends(current_user)):
    """[What the endpoint does and its error cases.]"""
    resource = repository.create(owner_id=user.id, **body.model_dump())
    return {"resource": resource}</code></pre>
      <h3>Data model</h3>
      <pre><code class="language-sql">CREATE TABLE [resource] (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);</code></pre>
      <h2>Alternatives considered</h2>
      <ol data-list-style="lower-alpha">
        <li><p>[Alternative] — [why not]</p></li>
        <li><p>[Alternative] — [why not]</p></li>
      </ol>
      <h2>Rollout plan</h2>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false"><p>Ship behind a feature flag</p></li>
        <li data-type="taskItem" data-checked="false"><p>Enable for internal users</p></li>
        <li data-type="taskItem" data-checked="false"><p>Gradual rollout to 100%</p></li>
      </ul>
      <h2>Risks and open questions</h2>
      <ul><li><p>[Risk or question]</p></li></ul>`,
  },
  {
    id: 'status-report',
    name: 'Weekly status report',
    category: 'Work',
    description: 'Highlights, progress, blockers and next steps',
    accent: '#28a06a',
    title: 'Status report – Week of [Date]',
    content: html`
      <h1>Weekly status — [Team / project]</h1>
      <p><em>Week of [Date] · Prepared by [Name]</em></p>
      <h2>Overall status: [On track / At risk / Off track]</h2>
      <p>[One-sentence summary for leadership.]</p>
      <h2>Highlights</h2>
      <ul data-list-style="check">
        <li><p>[Shipped or completed]</p></li>
        <li><p>[Milestone reached]</p></li>
      </ul>
      <h2>In progress</h2>
      <ul>
        <li><p>[Work item] — [% complete / expected date]</p></li>
      </ul>
      <h2>Blockers and risks</h2>
      <ul data-list-style="arrow">
        <li><p>[Blocker] — <strong>needs:</strong> [decision / help from whom]</p></li>
      </ul>
      <h2>Next week</h2>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false"><p>[Planned item]</p></li>
        <li data-type="taskItem" data-checked="false"><p>[Planned item]</p></li>
      </ul>`,
  },
  {
    id: 'postmortem',
    name: 'Incident postmortem',
    category: 'Engineering',
    description: 'Blameless review: impact, timeline, root cause, actions',
    accent: '#c8102e',
    title: 'Postmortem – [Incident] – [Date]',
    content: html`
      <h1>Incident postmortem: [Short title]</h1>
      <p><strong>Date:</strong> [Date] · <strong>Severity:</strong> [SEV-x] · <strong>Duration:</strong> [hh:mm] · <strong>Author:</strong> [Name]</p>
      <blockquote><p>This review is blameless: we focus on systems and processes, not individuals.</p></blockquote>
      <h2>Summary</h2>
      <p>[What happened, in two or three sentences.]</p>
      <h2>Impact</h2>
      <ul>
        <li><p>[Users or customers affected]</p></li>
        <li><p>[Requests failed / revenue / SLA impact]</p></li>
      </ul>
      <h2>Timeline (UTC)</h2>
      <ul data-list-style="dash">
        <li><p><strong>[hh:mm]</strong> — [Event]</p></li>
        <li><p><strong>[hh:mm]</strong> — [Alert fired / detected]</p></li>
        <li><p><strong>[hh:mm]</strong> — [Mitigated]</p></li>
        <li><p><strong>[hh:mm]</strong> — [Resolved]</p></li>
      </ul>
      <h2>Root cause</h2>
      <p>[The underlying cause, and why our safeguards did not catch it.]</p>
      <h2>What went well / what didn't</h2>
      <ul data-list-style="check"><li><p>[Went well]</p></li></ul>
      <ul data-list-style="arrow"><li><p>[Could improve]</p></li></ul>
      <h2>Action items</h2>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false"><p>[Preventive action] — [Owner] — [Due]</p></li>
        <li data-type="taskItem" data-checked="false"><p>[Detection improvement] — [Owner] — [Due]</p></li>
      </ul>`,
  },
  {
    id: 'project-plan',
    name: 'Project plan',
    category: 'Work',
    description: 'Milestones, owners and a checklist per phase',
    accent: '#f9a35c',
    title: 'Project plan – [Project name]',
    content: html`
      <h1>[Project name] — Plan</h1>
      <p><strong>Lead:</strong> [Name] · <strong>Start:</strong> [Date] · <strong>Target finish:</strong> [Date]</p>
      <h2>Objective</h2>
      <p>[What done looks like.]</p>
      <h2>Team</h2>
      <ul>
        <li><p>[Name] — [Role / responsibility]</p></li>
        <li><p>[Name] — [Role / responsibility]</p></li>
      </ul>
      <h2>Phase 1 — Plan ([dates])</h2>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false"><p>Confirm scope and success criteria</p></li>
        <li data-type="taskItem" data-checked="false"><p>Identify stakeholders and risks</p></li>
      </ul>
      <h2>Phase 2 — Execute ([dates])</h2>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false"><p>[Deliverable]</p></li>
        <li data-type="taskItem" data-checked="false"><p>[Deliverable]</p></li>
      </ul>
      <h2>Phase 3 — Launch and review ([dates])</h2>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false"><p>Launch</p></li>
        <li data-type="taskItem" data-checked="false"><p>Retrospective and lessons learned</p></li>
      </ul>
      <h2>Milestones</h2>
      <ol data-list-style="decimal-leading-zero">
        <li><p>[Milestone] — [date]</p></li>
        <li><p>[Milestone] — [date]</p></li>
      </ol>`,
  },
  {
    id: 'business-letter',
    name: 'Business letter',
    category: 'Work',
    description: 'Formal letter layout with sender and recipient blocks',
    accent: '#272d3b',
    title: 'Letter – [Recipient]',
    content: html`
      <p><strong>[Your Company]</strong><br>[Street address]<br>[City, Postal code]<br>[Phone] · [email@example.com]</p>
      <p>[Date]</p>
      <p>[Recipient name]<br>[Title]<br>[Company]<br>[Address]</p>
      <p><strong>Subject: [Purpose of the letter]</strong></p>
      <p>Dear [Recipient name],</p>
      <p>[Opening: state why you are writing.]</p>
      <p>[Body: the details, request or information, with any dates or figures the reader needs.]</p>
      <p>[Closing: the next step or what you would like the reader to do.]</p>
      <p>Kind regards,</p>
      <p>[Your name]<br>[Your title]</p>`,
  },
  {
    id: 'lesson-plan',
    name: 'Lesson plan',
    category: 'Education',
    description: 'Objectives, materials, activities and assessment',
    accent: '#a5e075',
    title: 'Lesson plan – [Subject] – [Topic]',
    content: html`
      <h1>[Topic]</h1>
      <p><strong>Subject:</strong> [Subject] · <strong>Grade / level:</strong> [Level] · <strong>Duration:</strong> [Minutes]</p>
      <h2>Learning objectives</h2>
      <p>By the end of this lesson, students will be able to:</p>
      <ol data-list-style="lower-alpha">
        <li><p>[Objective]</p></li>
        <li><p>[Objective]</p></li>
      </ol>
      <h2>Materials</h2>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false"><p>[Material]</p></li>
        <li data-type="taskItem" data-checked="false"><p>[Material]</p></li>
      </ul>
      <h2>Lesson flow</h2>
      <ol>
        <li><p><strong>Warm-up ([5] min):</strong> [Activity]</p></li>
        <li><p><strong>Instruction ([15] min):</strong> [Activity]</p></li>
        <li><p><strong>Practice ([20] min):</strong> [Activity]</p></li>
        <li><p><strong>Wrap-up ([5] min):</strong> [Activity]</p></li>
      </ol>
      <h2>Assessment</h2>
      <p>[How you will check understanding.]</p>
      <h2>Homework</h2>
      <p>[Assignment]</p>`,
  },
  {
    id: 'research-report',
    name: 'Research report',
    category: 'Education',
    description: 'Abstract, method, findings and references over two pages',
    accent: '#82aaff',
    title: 'Report – [Title]',
    content: html`
      <h1>[Report title]</h1>
      <p><em>[Author] · [Organisation] · [Date]</em></p>
      <h2>Abstract</h2>
      <p>[150–250 words summarising the question, method, key findings and conclusion.]</p>
      <h2>1. Introduction</h2>
      <p>[Background and the question this report answers.]</p>
      <h2>2. Method</h2>
      <p>[Data sources, sample, and how the analysis was done.]</p>
      <h2>3. Findings</h2>
      <ol data-list-style="lower-roman">
        <li><p>[Finding, with supporting evidence]</p></li>
        <li><p>[Finding, with supporting evidence]</p></li>
      </ol>
      <hr data-type="page-break">
      <h2>4. Discussion</h2>
      <p>[What the findings mean, limitations, and alternative explanations.]</p>
      <h2>5. Recommendations</h2>
      <ul data-list-style="arrow">
        <li><p>[Recommendation]</p></li>
      </ul>
      <h2>References</h2>
      <ol>
        <li><p>[Author, Title, Publisher, Year.]</p></li>
      </ol>`,
  },
];
