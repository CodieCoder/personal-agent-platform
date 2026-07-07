Feature: Source-backed research

  @research @citations @workspace
  Scenario: User completes cited research with local providers
    Given I navigate to "/research?workspaceId=workspace_qa_alpha"
    When I wait for css:[data-research-ready='true']
    And I type "How does SQLite support local-first application persistence?" into the field "Question"
    And I type "official docs and technical explainers" into the field "Focus"
    And I select "all" in the field "Time range"
    And I type "1" into the field "Source limit"
    And I type "3" into the field "Search results"
    And I click the button "Run research"
    And I wait for the heading "Report review"
    Then css:[data-research-report-detail='true'] should contain text "completed"
    And css:[data-research-report-detail='true'] should contain text "Cited findings"
    And css:[data-research-report-detail='true'] should contain text "Citations"
    And css:[data-research-report-detail='true'] should contain text "coverage_note"

  @research @memory @proposal
  Scenario: User requests proposed memory without activating memory
    Given I navigate to "/research?workspaceId=workspace_qa_alpha"
    When I wait for css:[data-research-ready='true']
    And I type "Which SQLite persistence finding should become proposed memory?" into the field "Question"
    And I type "local-first application persistence official docs" into the field "Focus"
    And I select "all" in the field "Time range"
    And I type "1" into the field "Source limit"
    And I type "3" into the field "Search results"
    And I check the checkbox "Propose citation-backed memory"
    And I click the button "Run research"
    And I wait for the heading "Report review"
    Then css:[data-research-report-detail='true'] should contain text "pending_review"
    And css:[data-research-report-detail='true'] should contain text "1 pending, 0 active, 0 rejected."
    And css:[data-research-report-detail='true'] should contain text "proposed"
