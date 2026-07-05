Feature: Search and web extraction fixture edge cases

  @search @extraction @unsafe-url @fixture
  Scenario: User sees a safe error for an unsafe URL
    Given I navigate to "/search-test?workspaceId=workspace_qa_alpha"
    When I wait for css:[data-search-test-ready='true']
    And I type "local AI engineering" into the field "Query"
    And I click the button "Run search"
    And I wait for css:.search-result-list
    And I click the button "Select result Blocked local-network control panel"
    And I click the button "Extract selected result"
    And I wait for css:[role='alert']
    Then css:[role='alert'] should contain text "WEB_FETCH_FAILED"
    And css:.result-error:not([role='alert']) should contain text "server-side fetch policy"

  @search @extraction @unsafe-url @trace @fixture
  Scenario: User opens unsafe URL policy trace evidence
    Given I navigate to "/search-test?workspaceId=workspace_qa_alpha"
    When I wait for css:[data-search-test-ready='true']
    And I type "local AI engineering" into the field "Query"
    And I click the button "Run search"
    And I wait for css:.search-result-list
    And I click the button "Select result Blocked local-network control panel"
    And I click the button "Extract selected result"
    And I wait for css:[role='alert']
    And I click the link "Open failed execution detail"
    And I wait for the heading "Execution detail"
    Then css:.page-header should contain text "failed"
    And css:.trace-list should contain text "validate URL policy"
    And css:.trace-list should contain text "fetch_url_blocked"
    And css:.trace-list should contain text "persist web evidence"
