Feature: Source-backed research fixture edge cases

  @research @partial-failure @sources @fixture
  Scenario: User sees one-source failure while cited research remains available
    Given I navigate to "/research?workspaceId=workspace_qa_alpha"
    When I wait for css:[data-research-ready='true']
    And I type "How should PAP surface partial research source failures?" into the field "Question"
    And I select "all" in the field "Time range"
    And I type "3" into the field "Source limit"
    And I type "3" into the field "Search results"
    And I click the button "Run research"
    And I wait for the heading "Report review"
    Then css:[data-research-report-detail='true'] should contain text "completed_with_warnings"
    And css:[data-research-report-detail='true'] should contain text "fetch_failed"
    And css:[data-research-report-detail='true'] should contain text "source_extraction_failed"
    And css:[data-research-report-detail='true'] should contain text "partial_source_failure"
    And css:[data-research-report-detail='true'] should contain text "Cited findings"
