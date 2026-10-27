# Notion access is scoped to one root page per Cohort

SocratEase reads Notion through its own internal integration, never through a person's access. In the Chas workspace that integration is shared only with the FJS26 root page. The Demo Cohort has a separate integration in a separate workspace. Sync starts from a configured root page per Cohort, walks only that page's children and databases, never uses Notion search and never follows links to pages outside the root.

This came from a real incident. An exploratory, workspace-wide search during design reached beyond FJS26. A future developer may be tempted to "simplify" sync with a search; don't. The boundary is enforced twice: by Notion's sharing permissions and by the sync's own traversal.

The Demo Cohort lives in the Teacher's own Notion workspace, not as a second root page in the Chas workspace. The demo is a portfolio piece and must survive a change of employer, and public material should not live in the employer's workspace. The demo is a full copy of the FJS26 structure, including its linked databases, trimmed down to one Course, because the relations between databases do not survive copying a single course page.
