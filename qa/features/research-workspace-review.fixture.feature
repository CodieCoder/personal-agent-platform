Feature: Research workspace review fixture flows

  @research @workspace-review @history @fixture
  Scenario: User reviews saved workspace research
    Given I navigate to "/workspaces/workspace_qa_alpha/research?question=warning&hasWarnings=true&page=1&pageSize=10"
    When I wait for the heading "QA Alpha"
    Then css:.report-history-card should contain text "QA warning research report"
    And css:.report-history-card should contain text "1 pending memory"
    And the text "QA beta warning research report" should not be visible

  @research @workspace-review @feedback @fixture
  Scenario: User gives research report and source feedback
    Given I navigate to "/research/research_report_qa_feedback?workspaceId=workspace_qa_alpha"
    When I wait for the heading "Report review"
    And I select "useful" in the field "Rating"
    And I check the checkbox "This report was useful"
    And I type "QA report feedback remains visible." into the field "Notes"
    And I click the button "Save feedback"
    And I select "useful" in the field "Source rating"
    And I type "QA source feedback remains visible." into the field "Source feedback notes"
    And I click css:section[aria-labelledby='research-sources-title'] button
    And I navigate to "/research/research_report_qa_feedback?workspaceId=workspace_qa_alpha"
    And I wait for the heading "Report review"
    Then css:section[aria-labelledby='research-report-feedback-title'] should contain text "QA report feedback remains visible."
    And css:section[aria-labelledby='research-sources-title'] should contain text "QA source feedback remains visible."
    And css:section[aria-labelledby='research-findings-title'] should contain text "QA feedback finding stays unchanged."

  @research @workspace-review @memory @fixture
  Scenario: User approves a research memory proposal
    Given I navigate to "/memory/memory_qa_research_proposal"
    When I wait for the heading "qa.research.memory"
    And I click the button "Approve"
    Then css:.page-header should contain text "semantic / active"
    And css:section[aria-labelledby='semantic-detail-metadata-title'] should contain text "research_report_qa_warning"
    And css:section[aria-labelledby='semantic-detail-metadata-title'] should contain text "exec_qa_research_warning"

  @research @workspace-review @export @fixture
  Scenario: User reviews export-ready cited report evidence
    Given I navigate to "/research/research_report_qa_export?workspaceId=workspace_qa_alpha"
    When I wait for the heading "Report review"
    And I click the button "Copy plain text"
    And I wait for css:[data-research-export-content='true']
    Then css:[data-research-report-detail='true'] should contain text "research_report_qa_export"
    And css:[data-research-report-detail='true'] should contain text "Open execution trace"
    And css:[data-research-report-detail='true'] should contain text "QA export finding"
    And css:[data-research-report-detail='true'] should contain text "QA export source"
    And css:[data-research-report-detail='true'] should contain text "QA export limitation"
    And css:[data-research-report-detail='true'] should contain text "Citations"
    And css:section[aria-labelledby='research-export-title'] should contain text "Plain text"
    And css:section[aria-labelledby='research-export-title'] should contain text "Sources (1)"
    And css:section[aria-labelledby='research-export-title'] should contain text "Limitations (1)"
    And css:section[aria-labelledby='research-export-title'] should contain text "QA export source"
    And css:section[aria-labelledby='research-export-title'] should contain text "qa_export_limitation"
